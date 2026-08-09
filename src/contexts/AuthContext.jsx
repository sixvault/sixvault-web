import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { authApi, authUtils } from '../lib/api/sixvaultApi';
import { generateKeyPairFromSeed, decrypt as rsaDecrypt } from '../lib/crypto/RSA';
import AES from '../lib/crypto/AES';

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

  const decryptTokensWithAES = (encryptedTokens, aesKey) => {
    try {
      const aes = new AES();
      
      // Decrypt access token
      const accessToken = aes.decrypt(encryptedTokens.access_token, aesKey);
      
      // Decrypt refresh token
      const refreshToken = aes.decrypt(encryptedTokens.refresh_token, aesKey);

      return {
        success: true,
        data: {
          access_token: accessToken,
          refresh_token: refreshToken
        }
      };
    } catch (error) {
      console.error('Error decrypting tokens with AES:', error);
      return {
        success: false,
        error: 'Failed to decrypt tokens'
      };
    }
  };

  const decryptAESKeyWithRSA = (encryptedAESKey, rsaPrivateKey) => {
    try {
      const decryptedKey = rsaDecrypt(encryptedAESKey, rsaPrivateKey);
      return {
        success: true,
        data: decryptedKey
      };
    } catch (error) {
      console.error('Error decrypting AES key with RSA:', error);
      return {
        success: false,
        error: 'Failed to decrypt AES key'
      };
    }
  };

  const isValidJWT = (token) => {
    try {
      if (!token || typeof token !== 'string') return false;
      
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      // Try to decode each part to ensure it's valid base64
      const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      
      // Basic JWT structure checks
      return header && payload && header.typ && payload.exp;
    } catch (error) {
      console.error('JWT validation error:', error);
      return false;
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

  const login = async (nimNip, password) => {
    try {
      setLoading(true);
      
      // Generate RSA key pair using password as seed
      const keyPair = await generateKeyPairFromSeed(password, 2048);
      
      const credentials = {
        nim_nip: nimNip,
        rsaPublicKey: keyPair.publicKey
      };

      const response = await authApi.login(credentials);
      
      if (response.status === 'success') {
        const { data } = response;
        
        try {
          // Decrypt AES key using RSA private key
          const aesKeyResult = decryptAESKeyWithRSA(data.encrypted_token_key, keyPair.privateKey);
          
          if (!aesKeyResult.success) {
            throw new Error(aesKeyResult.error);
          }
          
          const aesKey = aesKeyResult.data;
          
          // Decrypt JWT tokens using AES key
          const decryptedTokensResult = decryptTokensWithAES({
            access_token: data.access_token,
            refresh_token: data.refresh_token
          }, aesKey);
          
          if (!decryptedTokensResult.success) {
            throw new Error(decryptedTokensResult.error);
          }
          
          const decryptedTokens = decryptedTokensResult.data;
          
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
          localStorage.setItem('user_password', password); // Store for key regeneration
          
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
      
      // Generate RSA key pair using password as seed
      const keyPair = await generateKeyPairFromSeed(userData.password, 2048);
      
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
          // Decrypt AES key using RSA private key
          const aesKeyResult = decryptAESKeyWithRSA(data.encrypted_token_key, keyPair.privateKey);
          
          if (!aesKeyResult.success) {
            throw new Error(aesKeyResult.error);
          }
          
          const aesKey = aesKeyResult.data;
          
          // Decrypt JWT tokens using AES key
          const decryptedTokensResult = decryptTokensWithAES({
            access_token: data.access_token,
            refresh_token: data.refresh_token
          }, aesKey);
          
          if (!decryptedTokensResult.success) {
            throw new Error(decryptedTokensResult.error);
          }
          
          const decryptedTokens = decryptedTokensResult.data;
          
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
          localStorage.setItem('user_password', userData.password); // Store for key regeneration
          
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
    localStorage.removeItem('user_password');
    
    setUser(null);
    setIsAuthenticated(false);
  };

  const refreshToken = async () => {
    try {
      const response = await authApi.refreshToken();
      if (response.status === 'success') {
        const { data } = response;
        
        // Get stored keys and password
        const rsaPrivateKey = localStorage.getItem('rsa_private_key');
        const password = localStorage.getItem('user_password');
        
        if (!rsaPrivateKey || !password) {
          throw new Error('Missing required keys for token refresh');
        }
        
        // Decrypt AES key using RSA private key
        const aesKeyResult = decryptAESKeyWithRSA(data.encrypted_token_key, rsaPrivateKey);
        
        if (!aesKeyResult.success) {
          throw new Error(aesKeyResult.error);
        }
        
        const aesKey = aesKeyResult.data;
        
        // Decrypt JWT tokens using AES key
        const decryptedTokensResult = decryptTokensWithAES({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        }, aesKey);
        
        if (!decryptedTokensResult.success) {
          throw new Error(decryptedTokensResult.error);
        }
        
        const decryptedTokens = decryptedTokensResult.data;
        
        // Validate decrypted tokens are valid JWTs
        if (!isValidJWT(decryptedTokens.access_token) || !isValidJWT(decryptedTokens.refresh_token)) {
          throw new Error('Failed to decrypt valid JWT tokens during refresh');
        }
        
        // Update stored tokens
        localStorage.setItem('access_token', decryptedTokens.access_token);
        localStorage.setItem('refresh_token', decryptedTokens.refresh_token);
        localStorage.setItem('encrypted_token_key', data.encrypted_token_key);
        
        return true;
      }
      return false;
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

  const regenerateKeysFromPassword = async (password) => {
    try {
      const keyPair = await generateKeyPairFromSeed(password, 2048);
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