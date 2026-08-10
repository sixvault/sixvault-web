import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { authApi, authUtils } from '../lib/api/sixvaultApi';
import {
  generateKeyPairFromSeed,
  generateKeyPairFromSeedLegacy,
  sign as rsaSign
} from '../lib/crypto/RSA';
import { unwrapTokenEnvelope, isValidJWT } from '../lib/crypto/tokenEnvelope';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const tokenRefreshInterval = useRef(null);

  useEffect(() => {
    checkAuthStatus();
    return () => {
      // Cleanup interval on unmount
      if (tokenRefreshInterval.current) {
        clearInterval(tokenRefreshInterval.current);
      }
    };
  }, []);

  const startTokenRefreshPolling = () => {
    // Clear any existing interval
    if (tokenRefreshInterval.current) {
      clearInterval(tokenRefreshInterval.current);
    }

    // Set up new interval for 15 minutes (900000 ms)
    tokenRefreshInterval.current = setInterval(async () => {
      console.log('Auto-refreshing token...');
      const success = await refreshToken();
      if (!success) {
        console.log('Auto-refresh failed, logging out user');
        logout();
      }
    }, 15 * 60 * 1000); // 15 minutes
  };

  const stopTokenRefreshPolling = () => {
    if (tokenRefreshInterval.current) {
      clearInterval(tokenRefreshInterval.current);
      tokenRefreshInterval.current = null;
    }
  };

  const checkAuthStatus = () => {
    try {
      // Earlier builds kept the raw password in localStorage. Nothing reads it
      // any more, so purge it on load rather than waiting for the next logout —
      // otherwise it survives indefinitely in existing sessions.
      localStorage.removeItem('user_password');

      const currentUser = authUtils.getCurrentUser();
      if (currentUser && authUtils.isAuthenticated()) {
        // Get user data from localStorage
        const userData = getUserData();
        setUser(userData || currentUser);
        setIsAuthenticated(true);
        // Start token refresh polling
        startTokenRefreshPolling();
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const verifyTokenWithServer = async (accessToken) => {
    try {
      console.log('🔍 Verifying JWT token with server...');
      const response = await authApi.verifyToken(accessToken);
      
      if (response.status === 'success') {
        console.log('✅ JWT token verified successfully');
        return true;
      } else {
        console.log('❌ JWT token verification failed:', response.message);
        return false;
      }
    } catch (error) {
      console.error('❌ JWT token verification error:', error);
      return false;
    }
  };

  /**
   * Prove possession of a private key by signing a fresh server nonce.
   *
   * The server no longer accepts a public key as proof of anything — knowing one
   * granted a login, and public keys are not secrets. Returns null if no
   * challenge could be obtained.
   */
  const signChallenge = async (nimNip, privateKey) => {
    const response = await authApi.challenge(nimNip);

    if (response.status !== 'success' || !response.data?.nonce) {
      return null;
    }

    const { nonce } = response.data;
    return { nonce, signature: rsaSign(nonce, privateKey) };
  };

  /**
   * Move an account created under the old derivation onto the current one.
   *
   * Key derivation is now salted and stretched and honours the requested modulus
   * size, so every keypair changed. The keypair is the credential, so without
   * this an existing account would simply stop authenticating. The server
   * re-wraps the account's grade keys as part of the swap; it can, because it
   * reconstructs those keys from the shares it already holds.
   *
   * Returns true if the account was migrated.
   */
  const rekeyIfLegacy = async (nimNip, password, newKeyPair) => {
    const legacyKeyPair = await generateKeyPairFromSeedLegacy(password);

    // Signed with the legacy private key, which is what the server still has on
    // file for an unmigrated account.
    const proof = await signChallenge(nimNip, legacyKeyPair.privateKey);

    if (!proof) return false;

    const response = await authApi.rekey({
      nim_nip: nimNip,
      new_rsaPublicKey: newKeyPair.publicKey,
      ...proof
    });

    // A failure here means the legacy key was not on file either, so the
    // password is simply wrong — not a migration problem.
    return response.status === 'success';
  };

  const login = async (nimNip, password) => {
    try {
      setLoading(true);

      // Derive the keypair from the password, salted with the user's id so that
      // two users sharing a password do not share a keypair.
      const keyPair = await generateKeyPairFromSeed(password, 2048, nimNip);

      // Authentication is challenge-response: sign a fresh server nonce with the
      // derived private key. The public key is no longer accepted as proof,
      // because knowing one is not a secret.
      const proof = await signChallenge(nimNip, keyPair.privateKey);

      if (!proof) {
        return { success: false, error: 'Could not obtain a login challenge' };
      }

      let response = await authApi.login({ nim_nip: nimNip, ...proof });

      // The stored key may predate the derivation change. Prove ownership with
      // the old key once, swap it for the new one, and retry with a fresh
      // challenge — the first one has been spent.
      if (response.status !== 'success' && (await rekeyIfLegacy(nimNip, password, keyPair))) {
        const retryProof = await signChallenge(nimNip, keyPair.privateKey);

        if (retryProof) {
          response = await authApi.login({ nim_nip: nimNip, ...retryProof });
        }
      }

      if (response.status === 'success') {
        const { data } = response;
        
        try {
          const decryptedTokens = unwrapTokenEnvelope(data, keyPair.privateKey);

          // Validate decrypted tokens are valid JWTs
          if (!isValidJWT(decryptedTokens.access_token) || !isValidJWT(decryptedTokens.refresh_token)) {
            toast.error('Failed to decrypt valid authentication tokens. Please try again.', {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
            return { success: false, error: 'Failed to decrypt valid JWT tokens' };
          }
          
          // Verify JWT token with server
          const isTokenValid = await verifyTokenWithServer(decryptedTokens.access_token);
          if (!isTokenValid) {
            toast.error('Invalid login credentials. Please check your NIM/NIP and password.', {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
            return { success: false, error: 'JWT token verification failed' };
          }
          
          // Save decrypted authentication data
          const authData = {
            nim_nip: data.nim_nip,
            access_token: decryptedTokens.access_token,
            refresh_token: decryptedTokens.refresh_token,
            encrypted_token_key: data.encrypted_token_key
          };
          authUtils.saveAuthData(authData);
          
          // Save RSA keys
          localStorage.setItem('rsa_public_key', keyPair.publicKey);
          localStorage.setItem('rsa_private_key', keyPair.privateKey);

          // Save user profile data - use only backend response data
          const userData = {
            nim_nip: data.nim_nip,
            type: data.type,
            prodi: data.prodi,
            nama: data.nama,
            rsaPublicKey: keyPair.publicKey
          };
          localStorage.setItem('user_data', JSON.stringify(userData));
          
          setUser(userData);
          setIsAuthenticated(true);
          
          // Start token refresh polling
          startTokenRefreshPolling();
          
          return { success: true, data: authData };
        } catch (decryptionError) {
          console.error('Decryption/verification error:', decryptionError);
          toast.error('Authentication process failed. Please check your credentials and try again.', {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
          return { success: false, error: decryptionError.message || 'Authentication process failed' };
        }
      } else {
        toast.error(response.message || 'Invalid login credentials. Please check your NIM/NIP and password.', {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        return { success: false, error: response.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please check your credentials and try again.', {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      return { 
        success: false, 
        error: error.message || 'Login failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      setLoading(true);
      
      // Derive the keypair from the password, salted with the user's id so that
      // two users sharing a password do not share a keypair.
      const keyPair = await generateKeyPairFromSeed(
        userData.password,
        2048,
        userData.nim_nip
      );
      
      // Send everything except the password. The keypair derived from it is the
      // credential, so the password itself must never cross the wire — spreading
      // userData wholesale was transmitting it on every registration even though
      // the server ignores the field.
      const { password: _password, ...safeUserData } = userData;

      const registrationData = {
        ...safeUserData,
        rsaPublicKey: keyPair.publicKey
      };

      const response = await authApi.register(registrationData);
      
      if (response.status === 'success') {
        const { data } = response;
        
        try {
          const decryptedTokens = unwrapTokenEnvelope(data, keyPair.privateKey);

          // Validate decrypted tokens are valid JWTs
          if (!isValidJWT(decryptedTokens.access_token) || !isValidJWT(decryptedTokens.refresh_token)) {
            toast.error('Failed to decrypt valid authentication tokens. Please try again.', {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
            return { success: false, error: 'Failed to decrypt valid JWT tokens' };
          }
          
          // Verify JWT token with server
          const isTokenValid = await verifyTokenWithServer(decryptedTokens.access_token);
          if (!isTokenValid) {
            toast.error('Invalid registration. Please try again.', {
              position: "top-right",
              autoClose: 5000,
              hideProgressBar: false,
              closeOnClick: true,
              pauseOnHover: true,
              draggable: true,
            });
            return { success: false, error: 'JWT token verification failed' };
          }
          
          // Save decrypted authentication data
          const authData = {
            nim_nip: data.nim_nip,
            access_token: decryptedTokens.access_token,
            refresh_token: decryptedTokens.refresh_token,
            encrypted_token_key: data.encrypted_token_key
          };
          authUtils.saveAuthData(authData);
          
          // Save RSA keys
          localStorage.setItem('rsa_public_key', keyPair.publicKey);
          localStorage.setItem('rsa_private_key', keyPair.privateKey);

          // Save user profile data
          const userProfile = {
            ...userData,
            nim_nip: data.nim_nip,
            type: data.type || userData.type,
            prodi: data.prodi || userData.prodi,
            nama: data.nama || userData.nama,
            rsaPublicKey: keyPair.publicKey
          };
          delete userProfile.password; // Don't store password in user data
          localStorage.setItem('user_data', JSON.stringify(userProfile));
          
          setUser(userProfile);
          setIsAuthenticated(true);
          
          // Start token refresh polling
          startTokenRefreshPolling();
          
          return { success: true, data: authData };
        } catch (decryptionError) {
          console.error('Registration decryption/verification error:', decryptionError);
          toast.error('Registration process failed. Please try again.', {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
          return { success: false, error: decryptionError.message || 'Registration process failed' };
        }
      } else {
        toast.error(response.message || 'Registration failed. Please try again.', {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
        return { success: false, error: response.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please check your information and try again.', {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      return { 
        success: false, 
        error: error.message || 'Registration failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Stop token refresh polling
    stopTokenRefreshPolling();
    
    // Clear all stored data
    authUtils.logout();
    // Legacy key from builds that persisted the raw password. Removed here too so
    // an explicit logout clears it even if checkAuthStatus never ran.
    localStorage.removeItem('user_password');
    
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshToken = async () => {
    try {
      const response = await authApi.refreshToken();

      if (response.status !== 'success') {
        return false;
      }

      const { data } = response;

      // The refresh response is wrapped exactly as login's is. It used to arrive
      // in plaintext while this unwrapped it regardless, so every refresh threw
      // and the 15-minute poll logged the user out.
      const tokens = unwrapTokenEnvelope(data, localStorage.getItem('rsa_private_key'));

      if (!isValidJWT(tokens.access_token) || !isValidJWT(tokens.refresh_token)) {
        throw new Error('Failed to decrypt valid JWT tokens during refresh');
      }

      localStorage.setItem('access_token', tokens.access_token);
      localStorage.setItem('refresh_token', tokens.refresh_token);
      localStorage.setItem('encrypted_token_key', data.encrypted_token_key);

      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  };

  const getUserRSAKeys = () => {
    return {
      publicKey: localStorage.getItem('rsa_public_key'),
      privateKey: localStorage.getItem('rsa_private_key')
    };
  };

  const getUserData = () => {
    try {
      const userData = localStorage.getItem('user_data');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  };

  const regenerateKeysFromPassword = async (password, nimNip) => {
    try {
      // The salt must be the same id the keypair was originally derived under,
      // or the regenerated key will not match the one the server has stored.
      const salt = nimNip ?? getUserData()?.nim_nip;

      if (!salt) {
        throw new Error('Cannot regenerate keys without the user\'s nim_nip');
      }

      const keyPair = await generateKeyPairFromSeed(password, 2048, salt);
      localStorage.setItem('rsa_public_key', keyPair.publicKey);
      localStorage.setItem('rsa_private_key', keyPair.privateKey);
      return keyPair;
    } catch (error) {
      console.error('Error regenerating keys:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    refreshToken,
    getUserRSAKeys,
    getUserData,
    checkAuthStatus,
    regenerateKeysFromPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 