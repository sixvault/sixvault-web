// API base configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

// Helper function to create fetch requests with proper error handling
const createFetchRequest = async (url, options = {}) => {
  const token = localStorage.getItem('access_token');
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${url}`, config);
    
    // Handle token refresh for 401 errors
    if (response.status === 401 && !options._retry) {
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const refreshResponse = await refreshAccessToken();
          const newToken = refreshResponse.access_token;
          localStorage.setItem('access_token', newToken);
          
          // Retry original request with new token
          return createFetchRequest(url, {
            ...options,
            _retry: true,
            headers: {
              ...config.headers,
              Authorization: `Bearer ${newToken}`,
            },
          });
        }
      } catch (refreshError) {
        // Refresh failed, clear auth data
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        throw new Error('Authentication failed');
      }
    }

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

// Authentication API
export const authApi = {
  // Register a new user
  register: async (userData) => {
    return createFetchRequest('/user/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Login user
  login: async (credentials) => {
    return createFetchRequest('/user/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  // Refresh access token
  refreshToken: async () => {
    return createFetchRequest('/user/auth/refresh-token', {
      method: 'GET',
    });
  },

  // Verify JWT access token
  verifyToken: async (accessToken) => {
    return createFetchRequest('/user/auth/verify', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
};

// User management API
export const userApi = {
  // Remove multiple users
  removeUsers: async (nimNipList) => {
    return createFetchRequest('/user/remove', {
      method: 'POST',
      body: JSON.stringify({ nim_nip: nimNipList }),
    });
  },

  // Access protected route (example)
  getProtectedData: async () => {
    return createFetchRequest('/protected', {
      method: 'GET',
    });
  },
};

// Student API
export const studentApi = {
  // Search for a student by NIM
  searchStudent: async (nimNip) => {
    return createFetchRequest('/student/search', {
      method: 'POST',
      body: JSON.stringify({ nim_nip: nimNip }),
    });
  },
};

// Grades (Nilai) API
export const nilaiApi = {
  // Add and encrypt grades
  addGrades: async (gradesData) => {
    return createFetchRequest('/nilai/add', {
      method: 'POST',
      body: JSON.stringify(gradesData),
    });
  },

  // Decrypt grades data
  decryptGrades: async (daftarNilaiId) => {
    return createFetchRequest('/nilai/decrypt', {
      method: 'POST',
      body: JSON.stringify({ daftarNilaiId }),
    });
  },

  // Decrypt all grades for a student using server-side decryption
  decryptAllStudentGrades: async (nimNip) => {
    try {
      // First, get the list of encrypted records to get their IDs
      const recordsResponse = await createFetchRequest(`/nilai/view/${nimNip}`, {
        method: 'GET',
      });

      if (recordsResponse.status !== 'success' || !recordsResponse.data || !recordsResponse.data.records) {
        throw new Error('No records found for this student');
      }

      const encryptedRecords = recordsResponse.data.records;
      const decryptedRecords = [];
      const errors = [];

      // Decrypt each record using the server-side decrypt endpoint
      for (const record of encryptedRecords) {
        try {
          const decryptedData = await createFetchRequest('/nilai/decrypt', {
            method: 'POST',
            body: JSON.stringify({ daftarNilaiId: record.id }),
          });

          if (decryptedData.status === 'success' && decryptedData.data) {
            decryptedRecords.push({
              id: record.id,
              nim: decryptedData.data.nim,
              kode: decryptedData.data.kode,
              nama: decryptedData.data.nama,
              nilai: decryptedData.data.nilai,
              nip_dosen: record.nip_dosen,
              // Add SKS if available in decrypted data or from original record
              sks: decryptedData.data.sks || '0'
            });
          } else {
            errors.push(`Failed to decrypt record ID ${record.id}: ${decryptedData.message || 'Unknown error'}`);
          }
        } catch (decryptError) {
          console.error(`Error decrypting record ID ${record.id}:`, decryptError);
          errors.push(`Error decrypting record ID ${record.id}: ${decryptError.message}`);
        }
      }

      return {
        status: 'success',
        data: {
          records: decryptedRecords,
          count: decryptedRecords.length,
          total: encryptedRecords.length,
          errors: errors
        }
      };
    } catch (error) {
      console.error('Error in decryptAllStudentGrades:', error);
      throw error;
    }
  },

  // Get student's encrypted grades by NIM/NIP
  getStudentGrades: async (nimNip) => {
    return createFetchRequest(`/nilai/view/${nimNip}`, {
      method: 'GET',
    });
  },

  // Request access to encrypted nilai data
  // The server takes the requester from the access token; requesterNip is
  // accepted for call-site compatibility but is no longer sent.
  requestAccess: async (nim) => {
    return createFetchRequest('/nilai/request', {
      method: 'POST',
      body: JSON.stringify({ nim }),
    });
  },

  // List key requests visible to the caller.
  // The endpoint returns the standard {status, message, data} envelope; callers
  // here expect a bare array, so unwrap it. The older bare-array response is
  // still accepted so a client can talk to an un-upgraded server.
  listPendingRequests: async () => {
    const response = await createFetchRequest('/nilai/request/list', {
      method: 'GET',
    });

    if (Array.isArray(response)) return response;
    return response?.data?.requests ?? [];
  },

  // Record a decision on a key request.
  // The approver identity comes from the access token, not from the body — it
  // was previously caller-supplied, which let anyone record an approval in
  // another advisor's name. `approverNip` is kept in the signature for
  // call-site compatibility and deliberately not sent.
  approveRequest: async (nim, requesterNip, _approverNip, approved = true) => {
    return createFetchRequest('/nilai/request/approve', {
      method: 'POST',
      body: JSON.stringify({
        nim,
        requester_nip: requesterNip,
        approved,
      }),
    });
  },

  // Sign student grades (for kaprodi)
  signGrades: async (nim, signature) => {
    return createFetchRequest('/nilai/sign', {
      method: 'POST',
      body: JSON.stringify({ nim, signature }),
    });
  },

  // List all signatures
  listSignatures: async () => {
    return createFetchRequest('/nilai/sign/list', {
      method: 'GET',
    });
  },
};

// Courses (Mata Kuliah) API
export const mataKuliahApi = {
  // List courses (backend will filter based on JWT user data)
  listCourses: async () => {
    return createFetchRequest('/matakuliah/list', {
      method: 'GET',
    });
  },

  // Add multiple courses
  addCourses: async (coursesData) => {
    return createFetchRequest('/matakuliah/add', {
      method: 'POST',
      body: JSON.stringify(coursesData),
    });
  },

  // Remove multiple courses
  removeCourses: async (kodeList) => {
    return createFetchRequest('/matakuliah/remove', {
      method: 'POST',
      body: JSON.stringify({ kodeList }),
    });
  },
};

// Kaprodi API
export const kaprodiApi = {
  // List all kaprodi users
  listKaprodi: async () => {
    return createFetchRequest('/kaprodi/list', {
      method: 'GET',
    });
  },
};

// Transcript API
export const transcriptApi = {
  // Generate PDF from LaTeX and upload to Cloudflare R2
  generateTranscript: async (nim, latex, encrypted = false, password = null) => {
    const body = { nim, latex, encrypted };
    if (encrypted && password) {
      body.password = password;
    }
    
    return createFetchRequest('/transcript/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Decrypt encrypted PDF from Cloudflare R2
  decryptTranscript: async (nim, password) => {
    return createFetchRequest('/transcript/decrypt', {
      method: 'POST',
      body: JSON.stringify({ nim, password }),
    });
  },
};

// Helper function for refresh token (used by interceptor)
const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }
  
  const response = await fetch(`${API_BASE_URL}/user/auth/refresh-token`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }
  
  return response.json();
};

// Auth utilities
export const authUtils = {
  // Save authentication data to localStorage
  saveAuthData: (authData) => {
    localStorage.setItem('access_token', authData.access_token);
    localStorage.setItem('refresh_token', authData.refresh_token);
    localStorage.setItem('encrypted_token_key', authData.encrypted_token_key);
    localStorage.setItem('user_nim_nip', authData.nim_nip);
  },

  // Get current user data
  getCurrentUser: () => {
    const token = localStorage.getItem('access_token');
    const nimNip = localStorage.getItem('user_nim_nip');
    return token && nimNip ? { nim_nip: nimNip, token } : null;
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!localStorage.getItem('access_token');
  },

  // Logout user
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('encrypted_token_key');
    localStorage.removeItem('user_nim_nip');
    localStorage.removeItem('user_data');
    localStorage.removeItem('rsa_public_key');
    localStorage.removeItem('rsa_private_key');
  },
};

// Validation utilities
export const validationUtils = {
  // Validate NIM/NIP format - now accepts 8-18 numeric characters only
  validateNimNip: (value) => {
    return /^\d{8,18}$/.test(value);
  },

  // Validate RSA public key format
  validateRsaPublicKey: (key) => {
    try {
      const decoded = atob(key);
      const parsed = JSON.parse(decoded);
      return parsed.e && parsed.n;
    } catch {
      return false;
    }
  },

  // Validate user type
  validateUserType: (type) => {
    return ['mahasiswa', 'dosen_wali', 'kaprodi'].includes(type);
  },

  // Validate program studi
  validateProdi: (prodi) => {
    return ['teknik_informatika', 'sistem_dan_teknologi_informasi'].includes(prodi);
  },

  // Validate grade value
  validateGrade: (nilai) => {
    return ['A', 'AB', 'B', 'BC', 'C', 'D'].includes(nilai);
  },

  // Validate password - minimum 6 characters
  validatePassword: (password) => {
    return password && password.length >= 6;
  },
}; 
// Remove axios default export since we're using fetch now 