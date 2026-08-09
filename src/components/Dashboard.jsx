import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Shield, 
  Lock, 
  Key, 
  User, 
  FileText, 
  Users, 
  BookOpen,
  LogOut,
  CheckCircle,
  GraduationCap,
  Settings,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  Unlock
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { buildSignaturePayload } from '../lib/crypto/signaturePayload';
import { deriveRecordKey } from '../lib/crypto/recordKey';
import { mataKuliahApi, nilaiApi, studentApi, transcriptApi, kaprodiApi } from '../lib/api/sixvaultApi';
import { decrypt as rsaDecrypt, sign as rsaSign, verify as rsaVerify } from '../lib/crypto/RSA';
import AES from '../lib/crypto/AES';
import { toast } from 'react-toastify';



const Dashboard = () => {
  const { user, logout, getUserData, getUserRSAKeys } = useAuth();
  const [userData, setUserData] = useState(null);
  const [rsaKeys, setRsaKeys] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Academic data state (moved to top level)
  const [studentData, setStudentData] = useState({
    nim: '',
    namaLengkap: '',
    mataKuliah: Array(10).fill().map(() => ({
      kode: '',
      nama: '',
      sks: '',
      indeks: 'A'
    }))
  });
  const [ipk, setIpk] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The encryption key the specification requires to be asked for at encryption
  // time. Each record's key is derived from it; it is never transmitted.
  const [encryptionPassphrase, setEncryptionPassphrase] = useState('');

  // Course management state for Kaprodi
  const [existingCourses, setExistingCourses] = useState([]);
  const [selectedCourses, setSelectedCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [isAddingCourses, setIsAddingCourses] = useState(false);
  const [isRemovingCourses, setIsRemovingCourses] = useState(false);
  
  // Student grades state
  const [studentGrades, setStudentGrades] = useState([]);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [isDecryptingGrades, setIsDecryptingGrades] = useState(false);
  const [gradesError, setGradesError] = useState('');
  const [decryptionStats, setDecryptionStats] = useState({ total: 0, successful: 0, failed: 0 });
  
  // Signature management state
  const [signatures, setSignatures] = useState([]);
  const [isLoadingSignatures, setIsLoadingSignatures] = useState(false);
  const [isSigningGrades, setIsSigningGrades] = useState(false);
  
  // View student records state (for kaprodi and dosen_wali)
  const [viewStudentState, setViewStudentState] = useState({
    nim: '',
    studentName: '',
    studentDosenWali: '',
    records: [],
    isLoading: false,
    isDecrypting: false,
    error: '',
    decryptionStats: { total: 0, successful: 0, failed: 0 },
    hasSearched: false,
    isDirectAccess: false,
    hasActiveRequest: false,
    requestStatus: '', // 'pending', 'approved', 'insufficient_approvals'
    pendingRequestId: null,
    approvals: [],
    requiredApprovals: 3,
    canCreateRequest: false,
    isServerSideDecryption: false
  });

  // Request management state (for dosen_wali)
  const [requestManagementState, setRequestManagementState] = useState({
    pendingRequests: [],
    approvedRequests: [],
    isLoadingRequests: false,
    lastChecked: null,
    newRequestNotifications: []
  });
  
  // Autocomplete state for academic data form
  const [courseSuggestions, setCourseSuggestions] = useState({});
  const [showSuggestions, setShowSuggestions] = useState({});
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState({});
  
  // Available courses from API
  const [availableCourses, setAvailableCourses] = useState([]);
  const [isLoadingAvailableCourses, setIsLoadingAvailableCourses] = useState(true);

  // Transcript generation state
  const [transcriptModalOpen, setTranscriptModalOpen] = useState(false);
  const [transcriptNim, setTranscriptNim] = useState('');
  const [transcriptStudentName, setTranscriptStudentName] = useState('');
  const [transcriptStudentData, setTranscriptStudentData] = useState([]);
  const [transcriptEncrypted, setTranscriptEncrypted] = useState(false);
  const [transcriptPassword, setTranscriptPassword] = useState('');
  const [isGeneratingTranscript, setIsGeneratingTranscript] = useState(false);
  const [generatedTranscriptUrl, setGeneratedTranscriptUrl] = useState('');
  const [isLoadingTranscriptData, setIsLoadingTranscriptData] = useState(false);
  // Opening an encrypted transcript: the stored object is RC4 ciphertext, so it
  // has to be decrypted before a viewer can render it.
  const [openEncryptedPassword, setOpenEncryptedPassword] = useState('');
  const [isOpeningEncrypted, setIsOpeningEncrypted] = useState(false);
  
  // Kaprodi data state
  const [kaprodiList, setKaprodiList] = useState([]);
  const [isLoadingKaprodi, setIsLoadingKaprodi] = useState(false);

  // Predefined course data
  const predefinedCourses = {
    teknik_informatika: JSON.parse('[{"kode":"WI1102","nama":"Berpikir Komputasional","sks":"2"},{"kode":"WI2002","nama":"Literasi Data dan Inteligensi Artifisial","sks":"2"},{"kode":"MA1101","nama":"Matematika I","sks":"4"},{"kode":"IF1220","nama":"Matematika Diskrit","sks":"3"},{"kode":"FI1101","nama":"Fisika Dasar I","sks":"3"},{"kode":"IF1221","nama":"Logika Komputasional","sks":"2"},{"kode":"KI1101","nama":"Kimia Dasar I","sks":"3"},{"kode":"IF1230","nama":"Organisasi dan Arsitektur Komputer","sks":"3"},{"kode":"WI1101","nama":"Pancasila","sks":"2"},{"kode":"WI2001","nama":"Pengenalan Rekayasa dan Desain","sks":"3"},{"kode":"WI1103","nama":"Pengantar Prinsip Keberlanjutan","sks":"2"},{"kode":"WI2005","nama":"Bahasa Indonesia","sks":"2"},{"kode":"WI1111","nama":"Laboratorium Fisika Dasar","sks":"1"},{"kode":"IF1210","nama":"Algoritma dan Pemrograman 1","sks":"3"},{"kode":"WI1116","nama":"Laboratorium Interaksi Komputer","sks":"1"},{"kode":"IF2110","nama":"Algoritma dan Pemrograman 2","sks":"3"},{"kode":"IF2010","nama":"Pemrograman Berorientasi Objek","sks":"3"},{"kode":"IF2120","nama":"Probabilitas dan Statistika","sks":"3"},{"kode":"IF2211","nama":"Strategi Algoritma","sks":"3"},{"kode":"IF2123","nama":"Aljabar Linier dan Geometri","sks":"3"},{"kode":"IF2224","nama":"Teori Bahasa Formal dan Otomata","sks":"4"},{"kode":"IF2130","nama":"Sistem Operasi","sks":"3"},{"kode":"IF2230","nama":"Jaringan Komputer","sks":"3"},{"kode":"IF2150","nama":"Rekayasa Perangkat Lunak","sks":"4"},{"kode":"IF2240","nama":"Basis Data","sks":"3"},{"kode":"WI2003","nama":"Olah Raga","sks":"1"},{"kode":"WI2022","nama":"Manajemen Proyek","sks":"2"},{"kode":"IF2180","nama":"Sosio-informatika dan Profesionalisme","sks":"2"},{"kode":"IF3110","nama":"Pengembangan Aplikasi Web","sks":"3"},{"kode":"IF3210","nama":"Pengembangan Aplikasi Piranti Bergerak","sks":"2"},{"kode":"IF3130","nama":"Sistem Paralel dan Terdistribusi","sks":"3"},{"kode":"IF3250","nama":"Proyek Perangkat Lunak","sks":"4"},{"kode":"IF3140","nama":"Sistem Basis Data","sks":"3"},{"kode":"IF3270","nama":"Pembelajaran Mesin","sks":"3"},{"kode":"IF3141","nama":"Sistem Informasi","sks":"3"},{"kode":"WI2004","nama":"Bahasa Inggris","sks":"2"},{"kode":"IF3151","nama":"Interaksi Manusia Komputer","sks":"3"},{"kode":"IF3211","nama":"Komputasi Domain Spesifik","sks":"2"},{"kode":"IF3170","nama":"Inteligensi Artifisial","sks":"4"},{"kode":"WI201X","nama":"Agama","sks":"2"},{"kode":"IF4092","nama":"Tugas Akhir","sks":"4"},{"kode":"WI2006","nama":"Kewarganegaraan","sks":"2"},{"kode":"IF4090","nama":"Kerja Praktik","sks":"2"},{"kode":"IF4091","nama":"Penyusunan Proposal","sks":"2"},{"kode":"IF4010","nama":"Pemrograman Unit Pemrosesan Grafis","sks":"3"},{"kode":"IF4020","nama":"Kriptografi","sks":"3"},{"kode":"IF4021","nama":"Pemodelan dan Simulasi","sks":"3"},{"kode":"IF4031","nama":"Arsitektur Aplikasi Terdistribusi","sks":"3"},{"kode":"IF4033","nama":"Keamanan Siber","sks":"3"},{"kode":"IF4035","nama":"Blockchain","sks":"3"},{"kode":"IF4040","nama":"Pemodelan Data Lanjut","sks":"3"},{"kode":"IF4041","nama":"Penambangan Data","sks":"3"},{"kode":"IF4042","nama":"Sistem Temu Balik Informasi","sks":"3"},{"kode":"IF4044","nama":"Teknologi Big Data","sks":"3"},{"kode":"IF4050","nama":"Perkembangan dalam Rekayasa Perangkat Lunak","sks":"3"},{"kode":"IF4051","nama":"Pengembangan Sistem IoT","sks":"3"},{"kode":"IF4052","nama":"Komputasi Layanan","sks":"3"},{"kode":"IF4053","nama":"Keamanan Perangkat Lunak","sks":"3"},{"kode":"IF4054","nama":"Pengoperasian Sistem Perangkat Lunak","sks":"3"},{"kode":"IF4060","nama":"Rekayasa Interaksi","sks":"3"},{"kode":"IF4061","nama":"Visualisasi Data","sks":"3"},{"kode":"IF4062","nama":"Grafika Komputer","sks":"3"},{"kode":"IF4063","nama":"Gim dan Realitas Digital","sks":"3"},{"kode":"IF4070","nama":"Representasi Pengetahuan dan Penalaran","sks":"3"},{"kode":"IF4071","nama":"Pemrosesan Ucapan","sks":"3"},{"kode":"IF4072","nama":"Pemrosesan Bahasa Alami","sks":"3"},{"kode":"IF4073","nama":"Pemrosesan Citra Digital","sks":"3"},{"kode":"IF4074","nama":"Pembelajaran Mesin Lanjut","sks":"2"},{"kode":"IF4082","nama":"Pengembangan Keprofesian/Komunitas Informatika A","sks":"2"},{"kode":"IF4083","nama":"Pengembangan Keprofesian/Komunitas Informatika B","sks":"3"},{"kode":"IF4084","nama":"Pengembangan Keprofesian/Komunitas Informatika C","sks":"4"},{"kode":"IF4085","nama":"Topik Khusus Informatika A","sks":"2"},{"kode":"IF4086","nama":"Topik Khusus Informatika B","sks":"3"},{"kode":"IF4087","nama":"Topik Khusus Informatika C","sks":"4"},{"kode":"IF4088","nama":"Pengembangan Kemampuan Interpersonal","sks":"2"}]'),
    sistem_dan_teknologi_informasi: JSON.parse('[{"kode":"MA1101","nama":"Matematika I","sks":"4"},{"kode":"II1200","nama":"Pengantar Sistem dan Teknologi Informasi","sks":"3"},{"kode":"FI1101","nama":"Fisika Dasar I","sks":"3"},{"kode":"IF1210","nama":"Algoritma dan Pemrograman 1","sks":"3"},{"kode":"KI1101","nama":"Kimia Dasar I","sks":"3"},{"kode":"WI2001","nama":"Pengenalan Rekayasa dan Desain","sks":"3"},{"kode":"WI1101","nama":"Pancasila","sks":"2"},{"kode":"WI2005","nama":"Bahasa Indonesia","sks":"2"},{"kode":"WI1102","nama":"Berpikir Komputasional","sks":"2"},{"kode":"WI201X","nama":"Agama","sks":"2"},{"kode":"WI1103","nama":"Pengantar Prinsip Keberlanjutan","sks":"2"},{"kode":"WI2006","nama":"Kewarganegaraan","sks":"2"},{"kode":"WI1111","nama":"Laboratorium Fisika Dasar","sks":"1"},{"kode":"WI2002","nama":"Literasi Data dan Inteligensi Artifisial","sks":"2"},{"kode":"WI1116","nama":"Laboratorium Interaksi Komputer","sks":"1"},{"kode":"WI2003","nama":"Olah Raga","sks":"1"},{"kode":"II2100","nama":"Komunikasi Interpersonal dan Publik","sks":"2"},{"kode":"II2210","nama":"Teknologi Platform","sks":"3"},{"kode":"II2110","nama":"Matematika Diskret","sks":"3"},{"kode":"II2211","nama":"Probabilitas dan Statistik","sks":"3"},{"kode":"II2120","nama":"Jaringan Komputer","sks":"3"},{"kode":"II2221","nama":"Analisis Kebutuhan Enterprise","sks":"3"},{"kode":"II2130","nama":"Sistem dan Arsitektur Komputer","sks":"3"},{"kode":"II2240","nama":"Sistem Multimedia","sks":"3"},{"kode":"IF2040","nama":"Pemodelan Basis Data","sks":"3"},{"kode":"II2250","nama":"Manajemen Basis Data","sks":"2"},{"kode":"IF2010","nama":"Pemrograman Berorientasi Objek","sks":"3"},{"kode":"II2260","nama":"Internet of Things","sks":"3"},{"kode":"WI2004","nama":"Bahasa Inggris","sks":"2"},{"kode":"IF2050","nama":"Dasar Rekayasa Perangkat Lunak","sks":"3"},{"kode":"II3120","nama":"Layanan Sistem dan Teknologi Informasi","sks":"3"},{"kode":"II3220","nama":"Tata Kelola Teknologi Informasi","sks":"3"},{"kode":"II3130","nama":"Arsitektur Enterprise","sks":"3"},{"kode":"II3230","nama":"Keamanan Informasi","sks":"3"},{"kode":"II3131","nama":"Interaksi Manusia Komputer","sks":"3"},{"kode":"II3240","nama":"Rekayasa Sistem dan Teknologi Informasi","sks":"4"},{"kode":"II3140","nama":"Pengembangan Aplikasi Web dan Mobile","sks":"3"},{"kode":"IF3211","nama":"Komputasi Domain Spesifik","sks":"2"},{"kode":"II3160","nama":"Teknologi Sistem Terintegrasi","sks":"3"},{"kode":"WI2022","nama":"Manajemen Proyek","sks":"2"},{"kode":"II3170","nama":"Hukum dan Etika Teknologi Informasi","sks":"2"},{"kode":"IF3070","nama":"Dasar Inteligensi Artifisial","sks":"3"},{"kode":"II4091","nama":"Proposal Tugas Akhir","sks":"2"},{"kode":"II4092","nama":"Tugas Akhir","sks":"4"},{"kode":"II4090","nama":"Kerja Praktik","sks":"2"},{"kode":"II4010","nama":"Manajemen Data","sks":"3"},{"kode":"II4011","nama":"Transformasi Digital","sks":"3"},{"kode":"II4012","nama":"Inteligensi Artifisial untuk Bisnis","sks":"3"},{"kode":"II4013","nama":"Data Analytics","sks":"3"},{"kode":"II4021","nama":"Kriptografi","sks":"3"},{"kode":"II4022","nama":"Rekayasa Privasi Digital","sks":"3"},{"kode":"II4023","nama":"Forensik Digital","sks":"3"},{"kode":"II4024","nama":"Hukum Siber","sks":"3"},{"kode":"II4050","nama":"Rekayasa Sistem Multimedia","sks":"2"},{"kode":"II4051","nama":"Manajemen Produk","sks":"2"},{"kode":"II4052","nama":"Analisis dan Perancangan Kinerja Sistem","sks":"2"},{"kode":"II4053","nama":"Audit Teknologi Informasi","sks":"2"},{"kode":"II4071","nama":"Pengembangan Keprofesian/Komunitas STI A","sks":"2"},{"kode":"II4072","nama":"Pengembangan Keprofesian/Komunitas STI B","sks":"3"},{"kode":"II4073","nama":"Pengembangan Keprofesian/Komunitas STI C","sks":"4"},{"kode":"II4074","nama":"Pengembangan Soft Skills STI","sks":"2"},{"kode":"II4075","nama":"Inovasi dan Studi Mandiri STI","sks":"3"},{"kode":"II4077","nama":"Pengembangan Wirausaha STI","sks":"4"},{"kode":"II4078","nama":"Penelitian STI","sks":"4"},{"kode":"II4079","nama":"Topik Khusus STI A","sks":"2"},{"kode":"II4080","nama":"Topik Khusus STI B","sks":"3"},{"kode":"II4081","nama":"Topik Khusus STI C","sks":"4"}]')
  };

  useEffect(() => {
    const data = getUserData();
    const keys = getUserRSAKeys();
    setUserData(data);
    setRsaKeys(keys);
  }, []);

  // Load signatures only when accessing specific tabs that need them
  useEffect(() => {
    if (userData && (activeTab === 'grades' || activeTab === 'view-student')) {
      loadSignatures();
    }
  }, [userData, activeTab]);

  // Load kaprodi data when needed for transcript generation
  useEffect(() => {
    if (transcriptModalOpen && kaprodiList.length === 0) {
      loadKaprodiData();
    }
  }, [transcriptModalOpen]);

  // Load approved requests from localStorage when userData becomes available
  useEffect(() => {
    if (userData?.nim_nip) {
      const savedApprovedRequests = localStorage.getItem(`approved_requests_${userData.nim_nip}`);
      if (savedApprovedRequests) {
        try {
          const parsedRequests = JSON.parse(savedApprovedRequests);
          setRequestManagementState(prev => ({
            ...prev,
            approvedRequests: parsedRequests
          }));
          console.log('[DEBUG] Loaded', parsedRequests.length, 'approved requests from localStorage');
        } catch (error) {
          console.error('[DEBUG] Error parsing saved approved requests:', error);
          // Clear corrupted data
          localStorage.removeItem(`approved_requests_${userData.nim_nip}`);
        }
      }
    }
  }, [userData?.nim_nip]);

  // Fetch available courses from API
  useEffect(() => {
    const fetchAvailableCourses = async () => {
      try {
        console.log('Starting to fetch available courses...');
        setIsLoadingAvailableCourses(true);
        
        // Backend will filter courses based on JWT user data
        const response = await mataKuliahApi.listCourses();
        
        if (response.status === 'success' && Array.isArray(response.data)) {
          // Transform API response to match our expected format
          const transformedCourses = response.data.map(course => ({
            kode: course.kode,
            nama: course.matakuliah, // API uses "matakuliah" field
            sks: course.sks.toString(), // Ensure SKS is string for consistency
            prodi: course.prodi // Include prodi field
          }));
          
          console.log('Transformed courses:', transformedCourses.length);
          setAvailableCourses(transformedCourses);
        } else {
          console.error('Invalid API response format:', response);
          toast.error('Failed to load available courses - Invalid response format');
        }
      } catch (error) {
        console.error('Error fetching available courses:', error);
        toast.error(`Failed to load available courses: ${error.message}`);
      } finally {
        setIsLoadingAvailableCourses(false);
      }
    };

    // Fetch for dosen_wali, mahasiswa, and kaprodi (all need it for SKS lookup)
    if (userData?.type === 'dosen_wali' || userData?.type === 'mahasiswa' || userData?.type === 'kaprodi') {
      fetchAvailableCourses();
    } else {
      setIsLoadingAvailableCourses(false);
    }
  }, [userData?.type]);

  // Load existing courses when kaprodi accesses course management
  useEffect(() => {
    if (userData?.type === 'kaprodi' && activeTab === 'courses') {
      loadExistingCourses();
    }
  }, [userData?.type, activeTab]);

  // Load student grades when mahasiswa accesses grades tab
  useEffect(() => {
    if (userData?.type === 'mahasiswa' && activeTab === 'grades') {
      loadStudentGrades();
    }
  }, [userData, activeTab]);

  // Polling for pending requests (dosen_wali only)
  useEffect(() => {
    if (userData?.type === 'dosen_wali') {
      console.log('[DEBUG] Starting request polling for dosen_wali:', userData.nim_nip);
      
      const pollPendingRequests = async () => {
        // Only poll if the tab is active to reduce API calls
        if (document.hidden) {
          return;
        }
        
        try {
          setRequestManagementState(prev => ({ ...prev, isLoadingRequests: true }));
          const response = await nilaiApi.listPendingRequests();
          
          if (Array.isArray(response)) {
                         // Include all requests: own requests + requests from colleagues that need approval
             const currentUserRequests = response.filter(request => 
               // Include own requests
               request.requester_nip === userData.nim_nip ||
               // Include requests where user has already interacted (approved)
               (request.approvals || []).some(approval => approval.nip === userData.nim_nip) ||
               // Include all other pending requests that might need approval (backend should filter by program studi)
               (request.requester_nip !== userData.nim_nip && request.status === 'pending')
             );
             
             console.log('[DEBUG] Raw API response:', response);
             console.log('[DEBUG] Current user NIP:', userData.nim_nip);
             console.log('[DEBUG] Filtered currentUserRequests:', currentUserRequests);
            
                         // Check for requests that became approved (3/3 approvals)
             const newlyApprovedRequests = currentUserRequests.filter(request => {
               const approvedCount = (request.approvals || []).filter(a => a.approved).length;
               const isApproved = request.status === 'approved' || approvedCount >= 3;
               const isMyRequest = request.requester_nip === userData.nim_nip;
               
               // Only consider it newly approved if it has enough approvals
               return isApproved && isMyRequest && approvedCount >= 3;
             });
             
             // Update approved requests - add newly approved ones and keep existing ones
             setRequestManagementState(prev => {
               const existingApprovedIds = prev.approvedRequests.map(req => `${req.nim}-${req.requester_nip}`);
               const newApprovedToAdd = newlyApprovedRequests.filter(req => 
                 !existingApprovedIds.includes(`${req.nim}-${req.requester_nip}`)
               );
               
               const updatedApprovedRequests = [...prev.approvedRequests, ...newApprovedToAdd];
               
               // Save to localStorage
               if (userData?.nim_nip) {
                 localStorage.setItem(`approved_requests_${userData.nim_nip}`, JSON.stringify(updatedApprovedRequests));
               }
               
               return {
                 ...prev,
                 approvedRequests: updatedApprovedRequests
               };
             });
             
             // Notifications removed for cleaner UX
             
                         // Check for requests that need notification
             const lastChecked = requestManagementState.lastChecked;
             let requestsToNotify = [];
             
             // Only show truly new requests since last check (avoid spam on first sign-in)
             if (lastChecked) {
                                requestsToNotify = currentUserRequests.filter(request => 
                   new Date(request.created_at) > lastChecked &&
                   request.requester_nip !== userData.nim_nip &&
                   request.status === 'pending' &&
                   !(request.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
                 );
               console.log('[DEBUG] Showing new requests since last check:', requestsToNotify.length);
             } else {
               // First check: don't spam with notifications, user can check the dashboard
               requestsToNotify = [];
               console.log('[DEBUG] First check - not showing notifications to avoid spam');
             }
             
                          // Show notifications for requests that need attention (removed for cleaner UX)
            
                         setRequestManagementState(prev => ({
               ...prev,
               pendingRequests: currentUserRequests,
               lastChecked: new Date(),
               newRequestNotifications: requestsToNotify
             }));
             
             // Clean up shown notifications for completed/approved requests
             const activeRequestIds = currentUserRequests.map(req => `${req.nim}-${req.requester_nip}`);
             const shownNotifications = JSON.parse(localStorage.getItem('shown_request_notifications') || '[]');
             const cleanedNotifications = shownNotifications.filter(notifId => activeRequestIds.includes(notifId));
             if (cleanedNotifications.length !== shownNotifications.length) {
               localStorage.setItem('shown_request_notifications', JSON.stringify(cleanedNotifications));
               console.log('[DEBUG] Cleaned up', shownNotifications.length - cleanedNotifications.length, 'old notifications');
             }
          }
        } catch (error) {
          console.error('Error polling pending requests:', error);
        } finally {
          setRequestManagementState(prev => ({ ...prev, isLoadingRequests: false }));
        }
      };

                    // Poll every 1 second
       const interval = setInterval(pollPendingRequests, 1000);
       
       // Poll immediately when tab becomes visible again
       const handleVisibilityChange = () => {
         if (!document.hidden) {
           pollPendingRequests();
         }
       };
       document.addEventListener('visibilitychange', handleVisibilityChange);
       
       // Initial poll
       pollPendingRequests();

       return () => {
         clearInterval(interval);
         document.removeEventListener('visibilitychange', handleVisibilityChange);
       };
    }
  }, [userData?.type, userData?.nim_nip]);

  // Check request status when viewing student records
  useEffect(() => {
    if (viewStudentState.hasActiveRequest && viewStudentState.pendingRequestId) {
      const checkRequestStatus = async () => {
        try {
          const response = await nilaiApi.listPendingRequests();
          if (Array.isArray(response)) {
            const currentRequest = response.find(request => 
              request.nim === viewStudentState.nim && 
              request.requester_nip === userData.nim_nip
            );
            
            if (currentRequest) {
              const approvedCount = (currentRequest.approvals || []).filter(approval => approval.approved).length;
              
              setViewStudentState(prev => ({
                ...prev,
                approvals: currentRequest.approvals || [],
                requestStatus: currentRequest.status === 'approved' ? 'approved' : 
                             approvedCount >= prev.requiredApprovals ? 'approved' : 'pending'
              }));
              
                          // If approved, try to fetch the data using server-side decryption
            if (currentRequest.status === 'approved' || approvedCount >= viewStudentState.requiredApprovals) {
              console.log('[DEBUG] Request approved, using server-side decryption');
              handleViewStudentSearch(true, true); // skipRequestCreation=true, useServerSideDecryption=true
            }
            }
          }
        } catch (error) {
          console.error('Error checking request status:', error);
        }
      };
      
      // Check every 10 seconds for active requests
      const interval = setInterval(checkRequestStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [viewStudentState.hasActiveRequest, viewStudentState.pendingRequestId, userData?.nim_nip]);

  // Grade point mapping
  const gradePoints = {
    'A': 4.0,
    'AB': 3.5,
    'B': 3.0,
    'BC': 2.5,
    'C': 2.0,
    'D': 1.0
  };

  // Signature management functions
  const loadSignatures = async () => {
    setIsLoadingSignatures(true);
    try {
      const response = await nilaiApi.listSignatures();
      if (response.status === 'success' && response.data) {
        // According to openapi.yaml, response.data is directly the array of signatures
        setSignatures(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      console.error('Error loading signatures:', error);
      toast.error('Failed to load signatures');
    } finally {
      setIsLoadingSignatures(false);
    }
  };

  // Memoised so the verification useMemos below can depend on it without being
  // invalidated on every render.
  const getSignatureForStudent = useCallback(
    (nim) => signatures.find(sig => sig.nim === nim),
    [signatures]
  );

  /**
   * Verify a stored signature over a student's records.
   *
   * Returns 'verified' | 'tampered' | 'no-signature' | 'error' rather than a
   * boolean, so a missing public key is distinguishable from a failed
   * comparison — both previously rendered as the same ❌.
   */
  const verifySignature = (signatureData, gradesData, nim, studentName) => {
    if (!signatureData) return 'no-signature';

    try {
      const kaprodiPublicKey = signatureData.kaprodiPublicKey;
      const signature = signatureData.signature;

      if (!kaprodiPublicKey || !signature) {
        console.error('Missing kaprodi public key or signature data');
        return 'error';
      }

      const dataToVerify = buildSignaturePayload(
        nim ?? signatureData.nim,
        studentName,
        gradesData
      );

      return rsaVerify(dataToVerify, signature, kaprodiPublicKey)
        ? 'verified'
        : 'tampered';
    } catch (error) {
      console.error('Error verifying signature:', error);
      return 'error';
    }
  };

  // Verification is computed here, before anything renders, because the
  // specification requires records to be verified *before* they are displayed
  // and invalid data to be treated as altered. It was previously computed inside
  // the banner's render block, where it could only choose a label — the table
  // rendered regardless, so altered data was shown as though it were authentic.
  const studentGradesVerification = useMemo(() => {
    if (!studentGrades || studentGrades.length === 0) return 'no-signature';
    return verifySignature(
      getSignatureForStudent(userData?.nim_nip),
      studentGrades,
      userData?.nim_nip,
      userData?.nama
    );
  }, [studentGrades, getSignatureForStudent, userData?.nim_nip, userData?.nama]);

  const viewStudentVerification = useMemo(() => {
    if (!viewStudentState.records || viewStudentState.records.length === 0) {
      return 'no-signature';
    }
    return verifySignature(
      getSignatureForStudent(viewStudentState.nim),
      viewStudentState.records,
      viewStudentState.nim,
      viewStudentState.studentName
    );
  }, [viewStudentState.records, viewStudentState.nim, viewStudentState.studentName, getSignatureForStudent]);

  // Explicit, per-student acknowledgement before altered data is revealed. The
  // point is that a viewer cannot mistake tampered records for authentic ones,
  // so the acknowledgement resets whenever the subject changes.
  const [acknowledgedUnverified, setAcknowledgedUnverified] = useState({});

  const isUnverifiedWithheld = (nim, verification) =>
    verification === 'tampered' && !acknowledgedUnverified[nim];

  const acknowledgeUnverified = (nim) =>
    setAcknowledgedUnverified(prev => ({ ...prev, [nim]: true }));

  /** Panel shown in place of withheld records. */
  const renderWithheldRecords = (nim) => (
    <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center">
      <div className="text-3xl mb-2">❌</div>
      <p className="text-red-800 font-semibold mb-1">
        Records withheld: signature verification failed
      </p>
      <p className="text-red-700 text-sm mb-4">
        These records do not match the program head's signature, so they must be
        treated as altered. They are not shown by default.
      </p>
      <button
        onClick={() => acknowledgeUnverified(nim)}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
      >
        Show unverified data anyway
      </button>
    </div>
  );

  const signStudentGrades = async (nim, gradesData, studentName) => {
    if (userData?.type !== 'kaprodi') {
      toast.error('Only program heads can sign academic records');
      return;
    }

    setIsSigningGrades(true);
    try {
      // Get private key for signing
      const privateKey = localStorage.getItem('rsa_private_key');
      if (!privateKey) {
        throw new Error('Private key not found. Please login again.');
      }

      // Covers every field of every record plus the student's identity, built
      // by the same helper verification uses so the two cannot drift.
      const dataToSign = buildSignaturePayload(nim, studentName, gradesData);

      // Sign the data
      const signature = rsaSign(dataToSign, privateKey);
      
      // Upload signature to server
      const response = await nilaiApi.signGrades(nim, signature);
      
      if (response.status === 'success') {
        toast.success('Academic records signed successfully');
        // Reload signatures to show the new one
        await loadSignatures();
      } else {
        throw new Error(response.message || 'Failed to upload signature');
      }
    } catch (error) {
      console.error('Error signing grades:', error);
      toast.error(`Failed to sign grades: ${error.message}`);
    } finally {
      setIsSigningGrades(false);
    }
  };

  // Calculate IPK automatically (moved to top level)
  useEffect(() => {
    const validCourses = studentData.mataKuliah.filter(mk => 
      mk.kode && mk.nama && mk.sks && mk.indeks
    );
    
    if (validCourses.length > 0) {
      const totalPoints = validCourses.reduce((sum, mk) => {
        return sum + (gradePoints[mk.indeks] * parseInt(mk.sks) || 0);
      }, 0);
      
      const totalSks = validCourses.reduce((sum, mk) => {
        return sum + (parseInt(mk.sks) || 0);
      }, 0);
      
      const calculatedIpk = totalSks > 0 ? totalPoints / totalSks : 0;
      setIpk(Math.round(calculatedIpk * 100) / 100);
    } else {
      setIpk(0);
    }
  }, [studentData.mataKuliah, gradePoints]);

  // Clean up old approved requests from localStorage
  useEffect(() => {
    if (userData?.nim_nip && requestManagementState.approvedRequests.length > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentApprovedRequests = requestManagementState.approvedRequests.filter(request => {
        const requestDate = new Date(request.created_at);
        return requestDate > thirtyDaysAgo;
      });
      
      // If we filtered out some old requests, update localStorage
      if (recentApprovedRequests.length !== requestManagementState.approvedRequests.length) {
        localStorage.setItem(`approved_requests_${userData.nim_nip}`, JSON.stringify(recentApprovedRequests));
        console.log('[DEBUG] Cleaned up', requestManagementState.approvedRequests.length - recentApprovedRequests.length, 'old approved requests');
      }
    }
  }, [userData?.nim_nip, requestManagementState.approvedRequests]);

  // Load kaprodi data
  const loadKaprodiData = async () => {
    setIsLoadingKaprodi(true);
    try {
      const response = await kaprodiApi.listKaprodi();
      if (response.status === 'success' && response.data) {
        setKaprodiList(response.data);
      }
    } catch (error) {
      console.error('Error loading kaprodi data:', error);
      toast.error('Failed to load program head data');
    } finally {
      setIsLoadingKaprodi(false);
    }
  };

  // Handle opening transcript modal
  const handleOpenTranscriptModal = async (nim, studentName, gradesData) => {
    setIsLoadingTranscriptData(true);
    try {
      let finalNim = nim;
      let finalStudentName = studentName;
      let finalGradesData = gradesData;

      // If this is a student downloading their own transcript, get data from localStorage and API
      if (userData?.type === 'mahasiswa' && (!nim || !studentName)) {
        console.log('[DEBUG] Student downloading own transcript, fetching data...');
        
        // Get NIM from localStorage or userData
        finalNim = localStorage.getItem('user_nim_nip') || userData?.nim_nip;
        
        if (!finalNim) {
          toast.error('Student NIM not found. Please login again.');
          return;
        }

        console.log('[DEBUG] Using NIM:', finalNim);

        // Get student name from API
        try {
          console.log('[DEBUG] Fetching student name from API...');
          const studentResponse = await studentApi.searchStudent(finalNim);
          if (studentResponse.status === 'success' && studentResponse.data?.nama) {
            finalStudentName = studentResponse.data.nama;
            console.log('[DEBUG] Got student name from API:', finalStudentName);
          } else {
            finalStudentName = userData?.nama || `Student ${finalNim}`;
            console.log('[DEBUG] Using fallback name:', finalStudentName);
          }
        } catch (error) {
          console.warn('Could not fetch student name from API, using fallback:', error);
          finalStudentName = userData?.nama || `Student ${finalNim}`;
        }

        // Use student grades if not provided
        if (!finalGradesData || finalGradesData.length === 0) {
          finalGradesData = studentGrades;
          console.log('[DEBUG] Using student grades, count:', finalGradesData?.length || 0);
        }
      }

      console.log('[DEBUG] Final transcript data:', {
        nim: finalNim,
        name: finalStudentName,
        recordsCount: finalGradesData?.length || 0
      });

      setTranscriptNim(finalNim);
      setTranscriptStudentName(finalStudentName);
      setTranscriptStudentData(finalGradesData || []);
      setTranscriptEncrypted(false);
      setTranscriptPassword('');
      setGeneratedTranscriptUrl('');
      setTranscriptModalOpen(true);
    } catch (error) {
      console.error('Error opening transcript modal:', error);
      toast.error('Failed to open transcript generation dialog');
    } finally {
      setIsLoadingTranscriptData(false);
    }
  };

  // Handle transcript generation
  const handleGenerateTranscript = async () => {
    if (!transcriptNim) {
      toast.error('Student NIM is required for transcript generation');
      return;
    }

    if (!transcriptStudentName) {
      toast.error('Student name is required for transcript generation');
      return;
    }

    if (!transcriptStudentData || transcriptStudentData.length === 0) {
      toast.error('No academic records found for transcript generation');
      return;
    }

    if (transcriptEncrypted && !transcriptPassword.trim()) {
      toast.error('Password is required for encrypted transcripts');
      return;
    }

    setIsGeneratingTranscript(true);
    try {
      // Send the decrypted grade rows, not a LaTeX document. The template now
      // lives on the server, so the client cannot hand arbitrary input to a TeX
      // compiler. The server takes the student's name, program and signature
      // from the database rather than trusting anything sent here.
      const records = transcriptStudentData.map(grade => ({
        kode: grade.kode,
        nama: grade.nama,
        sks: grade.sks,
        nilai: grade.nilai
      }));

      // Tell the server whether the signature verified, so an unverified
      // transcript is stamped rather than presented as authentic.
      const signature = getSignatureForStudent(transcriptNim);
      const verified = signature
        ? verifySignature(
            signature,
            transcriptStudentData,
            transcriptNim,
            transcriptStudentName
          ) === 'verified'
        : undefined;

      const response = await transcriptApi.generateTranscript(
        transcriptNim,
        records,
        transcriptEncrypted,
        transcriptEncrypted ? transcriptPassword : null,
        verified
      );

      if (response.status === 'success' && response.data) {
        setGeneratedTranscriptUrl(response.data.url);
        toast.success('Transcript generated successfully!');
      } else {
        throw new Error(response.message || 'Failed to generate transcript');
      }
    } catch (error) {
      console.error('Error generating transcript:', error);
      toast.error(`Failed to generate transcript: ${error.message}`);
    } finally {
      setIsGeneratingTranscript(false);
    }
  };

  // Open an encrypted transcript: fetch it, decrypt it server-side with the
  // supplied password, and hand the resulting PDF to the browser's viewer.
  // The specification requires this interface; there was previously no way to
  // open an encrypted transcript at all, and transcriptApi.decryptTranscript
  // had no call site.
  const handleOpenEncryptedTranscript = async () => {
    if (!openEncryptedPassword.trim()) {
      toast.error('Enter the password used to encrypt this transcript');
      return;
    }

    setIsOpeningEncrypted(true);
    try {
      const blob = await transcriptApi.decryptTranscript(
        transcriptNim,
        openEncryptedPassword
      );

      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      // Give the new tab time to take ownership of the blob before releasing it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('Transcript decrypted');
    } catch (error) {
      console.error('Error opening encrypted transcript:', error);
      toast.error(error.message || 'Failed to decrypt the transcript');
    } finally {
      setIsOpeningEncrypted(false);
    }
  };

  // Handle closing transcript modal
  const handleCloseTranscriptModal = () => {
    setTranscriptModalOpen(false);
    setTranscriptNim('');
    setTranscriptStudentName('');
    setTranscriptStudentData([]);
    setTranscriptEncrypted(false);
    setTranscriptPassword('');
    setGeneratedTranscriptUrl('');
    setIsLoadingTranscriptData(false);
  };

  const handleLogout = () => {
    logout();
    // No need to reload, AuthContext will handle state change
  };

  // Academic data handlers (moved to top level)
  const handleStudentChange = (field, value) => {
    setStudentData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCourseChange = (index, field, value) => {
    setStudentData(prev => ({
      ...prev,
      mataKuliah: prev.mataKuliah.map((mk, i) => 
        i === index ? { ...mk, [field]: value } : mk
      )
    }));
  };

  // Get available courses from API
  const getAllCourses = () => {
    return availableCourses;
  };

  // Get all selected course codes (except for the current row)
  const getSelectedCourseCodes = (excludeIndex) => {
    return studentData.mataKuliah
      .map((mk, i) => (i !== excludeIndex ? mk.kode.trim().toLowerCase() : null))
      .filter(Boolean);
  };

  // Get all selected course names (except for the current row)
  const getSelectedCourseNames = (excludeIndex) => {
    return studentData.mataKuliah
      .map((mk, i) => (i !== excludeIndex ? mk.nama.trim().toLowerCase() : null))
      .filter(Boolean);
  };

  // Search courses by kode or nama, excluding already selected ones
  const searchCourses = (query, index) => {
    if (!query || query.length < 2) return [];
    const allCourses = getAllCourses();
    const lowerQuery = query.toLowerCase();
    const selectedCodes = getSelectedCourseCodes(index);
    const selectedNames = getSelectedCourseNames(index);
    return allCourses.filter(course =>
      (course.kode.toLowerCase().includes(lowerQuery) ||
        course.nama.toLowerCase().includes(lowerQuery)) &&
      !selectedCodes.includes(course.kode.toLowerCase()) &&
      !selectedNames.includes(course.nama.toLowerCase())
    ).slice(0, 10); // Limit to 10 suggestions
  };

  // Handle autocomplete input change (now passes index)
  const handleCourseAutocompleteChange = (index, field, value) => {
    // Check for duplicate kode/nama
    if (field === 'kode' && value.length >= 2) {
      const selectedCodes = getSelectedCourseCodes(index);
      if (selectedCodes.includes(value.trim().toLowerCase())) {
        toast.error('Mata kuliah dengan kode ini sudah dipilih di baris lain!');
        return;
      }
    }
    if (field === 'nama' && value.length >= 2) {
      const selectedNames = getSelectedCourseNames(index);
      if (selectedNames.includes(value.trim().toLowerCase())) {
        toast.error('Mata kuliah dengan nama ini sudah dipilih di baris lain!');
        return;
      }
    }
    handleCourseChange(index, field, value);
    if (value.length >= 2) {
      const suggestions = searchCourses(value, index);
      setCourseSuggestions(prev => ({
        ...prev,
        [`${index}_${field}`]: suggestions
      }));
      setShowSuggestions(prev => ({
        ...prev,
        [`${index}_${field}`]: suggestions.length > 0
      }));
      setActiveSuggestionIndex(prev => ({
        ...prev,
        [`${index}_${field}`]: -1
      }));
    } else {
      setShowSuggestions(prev => ({
        ...prev,
        [`${index}_${field}`]: false
      }));
    }
  };

  // Handle selecting a course from suggestions
  const handleCourseSelect = (index, course) => {
    // Update all course fields
    setStudentData(prev => ({
      ...prev,
      mataKuliah: prev.mataKuliah.map((mk, i) => 
        i === index ? {
          ...mk,
          kode: course.kode,
          nama: course.nama,
          sks: course.sks
        } : mk
      )
    }));
    
    // Hide all suggestions for this row
    setShowSuggestions(prev => {
      const newState = { ...prev };
      delete newState[`${index}_kode`];
      delete newState[`${index}_nama`];
      return newState;
    });
    
    // Clear suggestions
    setCourseSuggestions(prev => {
      const newState = { ...prev };
      delete newState[`${index}_kode`];
      delete newState[`${index}_nama`];
      return newState;
    });
  };

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e, index, field) => {
    const suggestionKey = `${index}_${field}`;
    const suggestions = courseSuggestions[suggestionKey] || [];
    const activeIndex = activeSuggestionIndex[suggestionKey] || -1;
    
    if (suggestions.length === 0) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveSuggestionIndex(prev => ({
          ...prev,
          [suggestionKey]: activeIndex < suggestions.length - 1 ? activeIndex + 1 : 0
        }));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveSuggestionIndex(prev => ({
          ...prev,
          [suggestionKey]: activeIndex > 0 ? activeIndex - 1 : suggestions.length - 1
        }));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleCourseSelect(index, suggestions[activeIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(prev => ({
          ...prev,
          [suggestionKey]: false
        }));
        break;
    }
  };

  // Hide suggestions when clicking outside
  const handleBlur = (index, field) => {
    // Delay hiding to allow for click on suggestion
    setTimeout(() => {
      setShowSuggestions(prev => ({
        ...prev,
        [`${index}_${field}`]: false
      }));
    }, 200);
  };

  const handleSearchStudent = async () => {
    if (!studentData.nim) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/student/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ nim_nip: studentData.nim }),
      });

      if (response.ok) {
        const result = await response.json();
        setStudentData(prev => ({
          ...prev,
          namaLengkap: result.data.nama
        }));
      }
    } catch (error) {
      console.error('Error searching student:', error);
    }
  };

  const handleSubmitAcademicData = async () => {
    // The encryption key is mandatory: without it there is nothing to derive
    // record keys from, and the server rejects entries that arrive without one.
    if (!encryptionPassphrase.trim()) {
      toast.error('An encryption key is required to encrypt these records');
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare data for submission
      const validCourses = studentData.mataKuliah.filter(mk => 
        mk.kode && mk.nama && mk.sks && mk.indeks
      );
      // Credits and GPA are now sent and stored encrypted alongside the grade.
      // They were computed here and then dropped, so the stored record was
      // incomplete, the signature could not cover them, and credits had to be
      // reconstructed at display time from the plaintext course catalogue.
      //
      // Each record carries its own AES key, derived from the passphrase the
      // advisor supplies. The passphrase itself never leaves the browser; the
      // derived keys must, because the server wraps and splits them.
      const nilaiData = validCourses.map(mk => ({
        nim: studentData.nim,
        kode: mk.kode,
        nama: mk.nama,
        nilai: mk.indeks,
        sks: String(mk.sks),
        ipk: String(ipk),
        aes_key: deriveRecordKey(encryptionPassphrase, studentData.nim, mk.kode)
      }));

      // Goes through the API client rather than a bare fetch, so an expired
      // access token is refreshed and the request retried.
      const response = await nilaiApi.addGrades(nilaiData);

      if (response.status === 'success') {
          const rejected = response.data?.rejected ?? [];
          if (rejected.length > 0) {
            toast.warning(
              `${response.data.count} entries stored, ${rejected.length} rejected: ${rejected
                .map(r => r.kode || `#${r.index + 1}`)
                .join(', ')}`
            );
          } else {
            toast.success('Academic data submitted successfully!');
          }
          // Reset form
          setStudentData({
            nim: '',
            namaLengkap: '',
            mataKuliah: Array(10).fill().map(() => ({
              kode: '',
              nama: '',
              sks: '',
              indeks: 'A'
            }))
          });
          setEncryptionPassphrase('');
          // Clear autocomplete state
          setCourseSuggestions({});
          setShowSuggestions({});
          setActiveSuggestionIndex({});
      } else {
        throw new Error(response.message || 'Failed to submit data');
      }
    } catch (error) {
      console.error('Error submitting academic data:', error);
      toast.error(error.message || 'Error submitting data. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Request management handlers.
  // `approved` is explicit so an advisor can deny a request, not only approve
  // it — the server previously hardcoded approval and had no way to record a
  // refusal.
  const handleApproveRequest = async (nim, requesterNip, approved = true) => {
    try {
      const response = await nilaiApi.approveRequest(nim, requesterNip, userData.nim_nip, approved);
      if (response.message) {
        // Remove this request from shown notifications since it's now approved by us
        const requestId = `${nim}-${requesterNip}`;
        const shownNotifications = JSON.parse(localStorage.getItem('shown_request_notifications') || '[]');
        const updatedShownNotifications = shownNotifications.filter(notifId => notifId !== requestId);
        localStorage.setItem('shown_request_notifications', JSON.stringify(updatedShownNotifications));
        
        // Refresh pending requests
        const updatedRequests = await nilaiApi.listPendingRequests();
        if (Array.isArray(updatedRequests)) {
          setRequestManagementState(prev => ({
            ...prev,
            pendingRequests: updatedRequests.filter(request => 
              request.requester_nip === userData.nim_nip ||
              request.approvals.some(approval => approval.nip === userData.nim_nip)
            )
          }));
        }
      }
    } catch (error) {
      console.error('Error approving request:', error);
      // Error notifications removed for cleaner UX
    }
  };

  // Handle viewing decrypted records for approved requests
  const handleViewDecryptedRecords = async (nim, studentName) => {
    try {
      console.log('[DEBUG] Starting to view decrypted records for student:', nim);
      
      // Set loading state
      setViewStudentState(prev => ({
        ...prev,
        nim: nim,
        studentName: studentName || '',
        isLoading: true,
        isDecrypting: false,
        error: '',
        records: [],
        decryptionStats: { total: 0, successful: 0, failed: 0 },
        hasSearched: false,
        isDirectAccess: false,
        hasActiveRequest: true,
        requestStatus: 'approved',
        isServerSideDecryption: true
      }));

      // Switch to View Student Records tab
      setActiveTab('view-student');

      // Try to get the actual student name
      let actualStudentName = studentName || `Student ${nim}`;
      try {
        const studentSearchResponse = await studentApi.searchStudent(nim);
        actualStudentName = studentSearchResponse.data?.nama || actualStudentName;
        
        setViewStudentState(prev => ({
          ...prev,
          studentName: actualStudentName
        }));
        
        console.log('[DEBUG] Found student name:', actualStudentName);
      } catch (nameError) {
        console.warn('[DEBUG] Could not fetch student name:', nameError);
        // Continue with provided name or fallback
      }

      // Start server-side decryption process
      setViewStudentState(prev => ({
        ...prev,
        isLoading: false,
        isDecrypting: true,
        hasSearched: true
      }));
      
      try {
        const serverDecryptResponse = await nilaiApi.decryptAllStudentGrades(nim);
        
        if (serverDecryptResponse.status === 'success' && serverDecryptResponse.data) {
          const serverDecryptedRecords = serverDecryptResponse.data.records || [];
          const total = serverDecryptResponse.data.total || 0;
          const successful = serverDecryptResponse.data.count || 0;
          const failed = total - successful;
          const errors = serverDecryptResponse.data.errors || [];
          
          // Credits now come decrypted from the record itself. The catalogue
          // lookup below is only for rows created before credits were stored,
          // which have no ciphertext to decrypt.
          const enhancedRecords = serverDecryptedRecords.map(record => {
            let sks = record.sks || '0';
            if (sks === '0') {
              const matchingCourse = availableCourses.find(course => 
                course.kode === record.kode
              );
              if (matchingCourse) {
                sks = matchingCourse.sks;
              }
            }
            return { ...record, sks };
          });
          
          setViewStudentState(prev => ({
            ...prev,
            records: enhancedRecords,
            isDecrypting: false,
            decryptionStats: { total, successful, failed }
          }));
          
          // Decryption messaging removed for cleaner UX
          if (failed > 0 && errors.length > 0) {
            console.warn('[DEBUG] Server-side decryption errors:', errors);
          }
          
          if (enhancedRecords.length === 0 && total > 0) {
            setViewStudentState(prev => ({
              ...prev,
              error: 'Failed to decrypt all grade records using server-side decryption.'
            }));
          }
        } else {
          throw new Error('Server-side decryption failed: Invalid response');
        }
      } catch (serverDecryptError) {
        console.error('[DEBUG] Server-side decryption failed:', serverDecryptError);
        setViewStudentState(prev => ({
          ...prev,
          error: `Server-side decryption failed: ${serverDecryptError.message}`,
          isDecrypting: false
        }));
      }
    } catch (error) {
      console.error('[DEBUG] Error in handleViewDecryptedRecords:', error);
      setViewStudentState(prev => ({
        ...prev,
        error: `Error viewing decrypted records: ${error.message}`,
        isLoading: false,
        isDecrypting: false
      }));
    }
  };

  const createAccessRequest = async (nim, studentName) => {
    try {
      console.log('[DEBUG] Creating access request for student:', nim, 'by requester:', userData.nim_nip);
      
      setViewStudentState(prev => ({
        ...prev,
        isLoading: true,
        error: ''
      }));

      const response = await nilaiApi.requestAccess(nim, userData.nim_nip);
      console.log('[DEBUG] Request response:', response);
      
      if (response.id) {
        // Automatically approve own request
        console.log('[DEBUG] Auto-approving own request...');
        try {
          await nilaiApi.approveRequest(nim, userData.nim_nip, userData.nim_nip);
          console.log('[DEBUG] Auto-approval successful');
          
          setViewStudentState(prev => ({
            ...prev,
            hasActiveRequest: true,
            requestStatus: 'pending',
            pendingRequestId: response.id,
            isLoading: false
          }));
        } catch (approveError) {
          console.error('[DEBUG] Auto-approval failed:', approveError);
          
          setViewStudentState(prev => ({
            ...prev,
            hasActiveRequest: true,
            requestStatus: 'pending',
            pendingRequestId: response.id,
            isLoading: false
          }));
        }
      }
    } catch (error) {
      console.error('Error creating access request:', error);
      let errorMessage = error.message;
      
      if (error.message.includes('Request already exists')) {
        errorMessage = 'Access request already exists for this student. Please wait for approval.';
        // Check existing request status
        try {
          const pendingRequests = await nilaiApi.listPendingRequests();
          const existingRequest = pendingRequests.find(request => 
            request.nim === nim && request.requester_nip === userData.nim_nip
          );
          
          if (existingRequest) {
            setViewStudentState(prev => ({
              ...prev,
              hasActiveRequest: true,
              requestStatus: existingRequest.status,
              pendingRequestId: existingRequest.id,
              approvals: existingRequest.approvals || []
            }));
          }
        } catch (fetchError) {
          console.error('Error fetching existing request:', fetchError);
        }
      }
      
      setViewStudentState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));
    }
  };

  // View student records functions (for kaprodi and dosen_wali)
  const handleViewStudentSearch = async (skipRequestCreation = false, useServerSideDecryption = false) => {
    if (!viewStudentState.nim.trim()) {
      toast.error('Please enter a valid NIM');
      return;
    }

    setViewStudentState(prev => ({
      ...prev,
      isLoading: true,
      isDecrypting: false,
      error: '',
      records: [],
      studentName: '',
      studentDosenWali: '',
      decryptionStats: { total: 0, successful: 0, failed: 0 },
      hasSearched: false,
      isDirectAccess: false,
      hasActiveRequest: false,
      requestStatus: '',
      approvals: [],
      canCreateRequest: false,
      isServerSideDecryption: useServerSideDecryption
    }));

    try {
      // First, search for the student to get their name
      const studentSearchResponse = await studentApi.searchStudent(viewStudentState.nim.trim());
      const studentName = studentSearchResponse.data?.nama || 'Unknown Student';

      // Update student name first
      setViewStudentState(prev => ({
        ...prev,
        studentName
      }));

      // Then, try to get their grade records
      let response;
      let hasDirectAccess = false;
      let isUnauthorizedAccess = false;
      
      try {
        response = await nilaiApi.getStudentGrades(viewStudentState.nim.trim());
        console.log('[DEBUG] Raw API response:', response);
        
        // Check if the response indicates unauthorized access (even with 200 status)
        if (response.status === 'error' && response.message &&
            (response.message.includes('Unauthorized') || 
             response.message.includes('not authorized') ||
             response.message.includes('Unauthorized to view this data') ||
             response.message.includes('Request for group based decryption') ||
             response.message.includes('Forbidden'))) {
          console.log('[DEBUG] API returned error status:', response.message);
          isUnauthorizedAccess = true;
        }
        
        // Additional check for different possible error formats
        if (!isUnauthorizedAccess && (response.error || 
            (response.message && (response.message.includes('Unauthorized') || 
                                 response.message.includes('not authorized') ||
                                 response.message.includes('Request for group based decryption') ||
                                 response.message.includes('Forbidden'))))) {
          console.log('[DEBUG] API returned error in different format:', response);
          isUnauthorizedAccess = true;
        }
        
        if (isUnauthorizedAccess) {
          // Don't throw error here, handle it in the logic below
          console.log('[DEBUG] Detected unauthorized access via response check');
        } else {
          hasDirectAccess = true;
        }
      } catch (gradesError) {
        console.log('[DEBUG] Grades Error caught:', gradesError.message);
        // Check if this is an unauthorized access error
        if (gradesError.message.includes('403') || 
            gradesError.message.includes('Unauthorized') ||
            gradesError.message.includes('Unauthorized to view this data') ||
            gradesError.message.includes('Forbidden')) {
          console.log('[DEBUG] Detected unauthorized access via catch block');
          isUnauthorizedAccess = true;
        } else {
          // This is a different kind of error, re-throw it
          console.log('[DEBUG] Non-unauthorized error, re-throwing:', gradesError.message);
          throw gradesError;
        }
      }
      
      // Handle unauthorized access
      if (isUnauthorizedAccess) {
        console.log('[DEBUG] Processing unauthorized access, user type:', userData?.type, 'skipRequestCreation:', skipRequestCreation);
        
        // For dosen_wali, we can create a request for students not under their supervision
        if (userData?.type === 'dosen_wali' && !skipRequestCreation) {
          console.log('[DEBUG] Proceeding with request creation logic for dosen_wali');
          // Check if there's already a pending request
          try {
            const pendingRequests = await nilaiApi.listPendingRequests();
            const existingRequest = pendingRequests.find(request => 
              request.nim === viewStudentState.nim.trim() && 
              request.requester_nip === userData.nim_nip
            );
            
            if (existingRequest) {
              console.log('[DEBUG] Found existing request:', existingRequest);
              const approvedCount = (existingRequest.approvals || []).filter(approval => approval.approved).length;
              
              setViewStudentState(prev => ({
                ...prev,
                hasActiveRequest: true,
                requestStatus: existingRequest.status === 'approved' || approvedCount >= prev.requiredApprovals ? 'approved' : 'pending',
                pendingRequestId: existingRequest.id,
                approvals: existingRequest.approvals || [],
                hasSearched: true,
                isLoading: false
              }));
              
              // Request status info removed for cleaner UX
              
              if (existingRequest.status === 'approved' || approvedCount >= viewStudentState.requiredApprovals) {
                console.log('[DEBUG] Existing request is approved, will use server-side decryption');
                // Approved request - we'll use server-side decryption later in the flow
                // Set flags to indicate we have an approved request
                setViewStudentState(prev => ({
                  ...prev,
                  hasActiveRequest: true,
                  requestStatus: 'approved',
                  pendingRequestId: existingRequest.id,
                  approvals: existingRequest.approvals || [],
                  hasSearched: true,
                  isLoading: false,
                  isServerSideDecryption: true
                }));
                
                // Trigger server-side decryption directly
                handleViewStudentSearch(true, true); // skipRequestCreation=true, useServerSideDecryption=true
                return;
              } else {
                // Show pending request status (notifications removed for cleaner UX)
                return;
              }
            } else {
              // Show button to create request instead of auto-creating
              console.log('[DEBUG] No existing request found, showing request button');
              setViewStudentState(prev => ({
                ...prev,
                error: '',
                hasSearched: true,
                isLoading: false,
                canCreateRequest: true
              }));
              return;
            }
          } catch (requestError) {
            console.error('[DEBUG] Error checking pending requests:', requestError);
            setViewStudentState(prev => ({
              ...prev,
              error: 'Unable to access student records. You may need to request access from other faculty members.',
              hasSearched: true,
              isLoading: false
            }));
            return;
          }
        } else if (userData?.type === 'kaprodi') {
          // Kaprodi should have direct access to all students in their program, so this is a real error
          console.log('[DEBUG] Kaprodi unauthorized access - this should not happen');
          setViewStudentState(prev => ({
            ...prev,
            error: 'Unauthorized access. You may not have permission to view this student\'s records.',
            hasSearched: true,
            isLoading: false
          }));
          return;
        } else {
          // Other user types or skipRequestCreation=true
          console.log('[DEBUG] Cannot create request - user type or skip flag');
          setViewStudentState(prev => ({
            ...prev,
            error: 'Unauthorized to view this data. You may need to request access.',
            hasSearched: true,
            isLoading: false
          }));
          return;
        }
      }
      
              if (response.status === 'success' && response.data) {
        const encryptedRecords = response.data.records || [];
        
        setViewStudentState(prev => ({
          ...prev,
          hasSearched: true,
          isLoading: false,
          isDirectAccess: hasDirectAccess
        }));

        if (encryptedRecords.length === 0) {
          setViewStudentState(prev => ({
            ...prev,
            error: 'No grade records found for this student.',
            records: []
          }));
          return;
        }

        // Check if we should use server-side decryption (for approved group requests)
        if (useServerSideDecryption) {
          console.log('[DEBUG] Using server-side decryption for approved group request');
          
          // Start server-side decryption process
          setViewStudentState(prev => ({
            ...prev,
            isDecrypting: true
          }));
          
          try {
            const serverDecryptResponse = await nilaiApi.decryptAllStudentGrades(viewStudentState.nim.trim());
            
            if (serverDecryptResponse.status === 'success' && serverDecryptResponse.data) {
              const serverDecryptedRecords = serverDecryptResponse.data.records || [];
              const total = serverDecryptResponse.data.total || 0;
              const successful = serverDecryptResponse.data.count || 0;
              const failed = total - successful;
              const errors = serverDecryptResponse.data.errors || [];
              
              // As above: the catalogue lookup only covers pre-migration rows.
              const enhancedRecords = serverDecryptedRecords.map(record => {
                let sks = record.sks || '0';
                if (sks === '0') {
                  const matchingCourse = availableCourses.find(course => 
                    course.kode === record.kode
                  );
                  if (matchingCourse) {
                    sks = matchingCourse.sks;
                  }
                }
                return { ...record, sks };
              });
              
              setViewStudentState(prev => ({
                ...prev,
                records: enhancedRecords,
                isDecrypting: false,
                decryptionStats: { total, successful, failed }
              }));
              
              // Decryption results messaging removed for cleaner UX
              if (failed > 0 && errors.length > 0) {
                console.warn('[DEBUG] Server-side decryption errors:', errors);
              }
              
              if (enhancedRecords.length === 0 && total > 0) {
                setViewStudentState(prev => ({
                  ...prev,
                  error: 'Failed to decrypt all grade records using server-side decryption.'
                }));
              }
            } else {
              throw new Error('Server-side decryption failed: Invalid response');
            }
          } catch (serverDecryptError) {
            console.error('[DEBUG] Server-side decryption failed:', serverDecryptError);
            setViewStudentState(prev => ({
              ...prev,
              error: `Server-side decryption failed: ${serverDecryptError.message}`,
              isDecrypting: false
            }));
          }
          
          return; // Exit early for server-side decryption
        }

        // Continue with client-side decryption (original flow)
        console.log('[DEBUG] Using client-side decryption for direct access');
        
        // Get user's private key for RSA decryption
        const privateKey = localStorage.getItem('rsa_private_key');
        if (!privateKey) {
          throw new Error('Private key not found. Please login again.');
        }

        // Start decryption process
        setViewStudentState(prev => ({
          ...prev,
          isDecrypting: true
        }));
        
        const decryptedRecords = [];
        let successful = 0;
        let failed = 0;
        const total = encryptedRecords.length;

        // Decrypt each grade record
        for (const record of encryptedRecords) {
          try {
            // Step 1: Decrypt the AES key using RSA private key
            console.log('[DEBUG] Decrypting record for student:', viewStudentState.nim);
            const decryptedAESKey = rsaDecrypt(record.rsa_encrypted_aes_key, privateKey);
            
            // Step 2: Initialize AES with the decrypted key
            const aes = new AES();
            const decryptedKode = aes.decrypt(record.encrypted_data.kode, decryptedAESKey);
            const decryptedNama = aes.decrypt(record.encrypted_data.nama, decryptedAESKey);
            const decryptedNilai = aes.decrypt(record.encrypted_data.nilai, decryptedAESKey);
            
            // Step 3: Get SKS from encrypted data or available courses
            let sks = '0';
            if (record.encrypted_data.sks) {
              try {
                sks = aes.decrypt(record.encrypted_data.sks, decryptedAESKey);
                console.log('[DEBUG] SKS decrypted from encrypted data:', sks);
              } catch (sksError) {
                console.warn('[DEBUG] Failed to decrypt SKS, falling back to course lookup');
                // Fall back to course lookup if decryption fails
                const matchingCourse = availableCourses.find(course => 
                  course.kode === decryptedKode
                );
                if (matchingCourse) {
                  sks = matchingCourse.sks;
                  console.log('[DEBUG] SKS found in available courses:', sks);
                }
              }
            } else {
              // Try to get SKS from available courses
              console.log('[DEBUG] No encrypted SKS data, looking up in available courses for:', decryptedKode);
              const matchingCourse = availableCourses.find(course => 
                course.kode === decryptedKode
              );
              if (matchingCourse) {
                sks = matchingCourse.sks;
                console.log('[DEBUG] SKS found in available courses:', sks);
              } else {
                console.warn('[DEBUG] Course not found in available courses. Total courses available:', availableCourses.length);
              }
            }

            // The stored GPA and student name, where present. Decrypting them
            // means they come from the record rather than being recomputed from
            // the plaintext catalogue.
            let storedIpk = null;
            let storedNamaMahasiswa = null;
            try {
              if (record.encrypted_data.ipk) {
                storedIpk = aes.decrypt(record.encrypted_data.ipk, decryptedAESKey);
              }
              if (record.encrypted_data.nama_mahasiswa) {
                storedNamaMahasiswa = aes.decrypt(
                  record.encrypted_data.nama_mahasiswa,
                  decryptedAESKey
                );
              }
            } catch (optionalFieldError) {
              console.warn('[DEBUG] Failed to decrypt stored ipk/nama_mahasiswa', optionalFieldError);
            }

            decryptedRecords.push({
              id: record.id,
              ipk: storedIpk,
              nama_mahasiswa: storedNamaMahasiswa,
              kode: decryptedKode,
              nama: decryptedNama,
              nilai: decryptedNilai,
              sks: sks,
              nip_dosen: record.nip_dosen
            });
            
            successful++;
          } catch (decryptError) {
            console.error('Error decrypting record:', decryptError);
            failed++;
          }
          
          // Update decryption progress
          setViewStudentState(prev => ({
            ...prev,
            decryptionStats: { total, successful, failed }
          }));
        }

        setViewStudentState(prev => ({
          ...prev,
          records: decryptedRecords,
          isDecrypting: false
        }));
        
        // Final results messaging removed for cleaner UX
        
        if (decryptedRecords.length === 0 && encryptedRecords.length > 0) {
          setViewStudentState(prev => ({
            ...prev,
            error: 'Failed to decrypt all grade records. You may not have access to this student\'s records.'
          }));
        }
      } else {
        setViewStudentState(prev => ({
          ...prev,
          error: response.message || 'No grades found for this student',
          records: [],
          hasSearched: true
        }));
      }
    } catch (error) {
      console.error('[DEBUG] Outer catch - Error loading student records:', error);
      let errorMessage = `Error loading student records: ${error.message}`;
      
      // Handle specific error cases (but not Unauthorized - that's handled in inner catch for request creation)
      if (error.message.includes('404')) {
        errorMessage = 'Student not found or no records available.';
      } else if (error.message.includes('Network')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      
      setViewStudentState(prev => ({
        ...prev,
        error: errorMessage,
        records: [],
        hasSearched: true
      }));
    } finally {
      setViewStudentState(prev => ({
        ...prev,
        isLoading: false,
        isDecrypting: false
      }));
    }
  };

  const handleViewStudentNimChange = (value) => {
    setViewStudentState(prev => ({
      ...prev,
      nim: value,
      error: '',
      records: [],
      studentName: '',
      studentDosenWali: '',
      hasSearched: false,
      isDirectAccess: false,
      hasActiveRequest: false,
      requestStatus: '',
      approvals: [],
      canCreateRequest: false,
      isServerSideDecryption: false,
      decryptionStats: { total: 0, successful: 0, failed: 0 }
    }));
  };

  const clearViewStudentData = () => {
    setViewStudentState({
      nim: '',
      studentName: '',
      studentDosenWali: '',
      records: [],
      isLoading: false,
      isDecrypting: false,
      error: '',
      decryptionStats: { total: 0, successful: 0, failed: 0 },
      hasSearched: false,
      isDirectAccess: false,
      hasActiveRequest: false,
      requestStatus: '',
      pendingRequestId: null,
      approvals: [],
      requiredApprovals: 3,
      canCreateRequest: false,
      isServerSideDecryption: false
    });
  };

  // Course management functions
  const loadExistingCourses = async () => {
    if (userData?.type !== 'kaprodi') return;
    setIsLoadingCourses(true);
    try {
      // Backend will filter courses based on JWT user data
      const response = await mataKuliahApi.listCourses();
      if (response.status === 'success') {
        setExistingCourses(response.data);
      }
    } catch (error) {
      console.error('Error loading courses:', error);
      toast.error('Error loading courses. Please try again.');
    } finally {
      setIsLoadingCourses(false);
    }
  };

  const addPredefinedCourses = async () => {
    if (!userData?.prodi || !predefinedCourses[userData.prodi]) {
      toast.info('No predefined courses available for your program.');
      return;
    }
    setIsAddingCourses(true);
    try {
      const coursesToAdd = predefinedCourses[userData.prodi].map(course => ({
        kode: course.kode,
        matakuliah: course.nama,
        sks: parseInt(course.sks),
        prodi: userData.prodi
      }));
      const response = await mataKuliahApi.addCourses(coursesToAdd);
      if (response.status === 'success') {
        toast.success('Predefined courses added successfully!');
        await loadExistingCourses(); // Reload the list
      }
    } catch (error) {
      console.error('Error adding courses:', error);
      toast.error('Error adding courses. Please try again.');
    } finally {
      setIsAddingCourses(false);
    }
  };

  // Custom confirm toast for removal
  const showRemoveConfirm = (onConfirm) => {
    toast(
      ({ closeToast }) => (
        <div>
          <div className="font-semibold mb-2">Are you sure you want to remove {selectedCourses.length} selected courses?</div>
          <div className="flex gap-2 mt-2">
            <button
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              onClick={() => { onConfirm(); closeToast(); }}
            >
              Yes, Remove
            </button>
            <button
              className="px-3 py-1 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
              onClick={closeToast}
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      { autoClose: false }
    );
  };

  const removeSelectedCourses = async () => {
    if (selectedCourses.length === 0) {
      toast.info('Please select courses to remove.');
      return;
    }
    // Show confirm toast
    showRemoveConfirm(async () => {
      setIsRemovingCourses(true);
      try {
        const response = await mataKuliahApi.removeCourses(selectedCourses);
        if (response.status === 'success') {
          toast.success(`${selectedCourses.length} courses removed successfully!`);
          setSelectedCourses([]);
          await loadExistingCourses(); // Reload the list
        }
      } catch (error) {
        console.error('Error removing courses:', error);
        toast.error('Error removing courses. Please try again.');
      } finally {
        setIsRemovingCourses(false);
      }
    });
  };

  const toggleCourseSelection = (kode) => {
    setSelectedCourses(prev => 
      prev.includes(kode) 
        ? prev.filter(k => k !== kode)
        : [...prev, kode]
    );
  };

  const selectAllCourses = () => {
    if (selectedCourses.length === existingCourses.length) {
      setSelectedCourses([]);
    } else {
      setSelectedCourses(existingCourses.map(course => course.kode));
    }
  };

  // Student grades functions
  const loadStudentGrades = async () => {
    if (userData?.type !== 'mahasiswa') return;
    setIsLoadingGrades(true);
    setIsDecryptingGrades(false);
    setGradesError('');
    setDecryptionStats({ total: 0, successful: 0, failed: 0 });
    
    try {
      const response = await nilaiApi.getStudentGrades(userData.nim_nip);
      if (response.status === 'success' && response.data) {
        const encryptedRecords = response.data.records || [];
        const decryptedGrades = [];
        
        if (encryptedRecords.length === 0) {
          setGradesError('No grade records found.');
          setStudentGrades([]);
          return;
        }

        // Get user's private key for RSA decryption
        const privateKey = localStorage.getItem('rsa_private_key');
        if (!privateKey) {
          throw new Error('Private key not found. Please login again.');
        }

        // Start decryption process
        setIsLoadingGrades(false);
        setIsDecryptingGrades(true);
        
        let successful = 0;
        let failed = 0;
        const total = encryptedRecords.length;

        // Decrypt each grade record
        for (const record of encryptedRecords) {
          try {
            // Step 1: Decrypt the AES key using RSA private key
            console.log('[DEBUG] Encrypted AES key:', record.rsa_encrypted_aes_key);
            console.log('[DEBUG] Private key (first 20 chars):', privateKey ? privateKey.slice(0, 20) + '...' : 'null');
            let decryptedAESKey;
            try {
              decryptedAESKey = rsaDecrypt(record.rsa_encrypted_aes_key, privateKey);
              console.log('[DEBUG] Decrypted AES key:', decryptedAESKey);
            } catch (rsaError) {
              console.error('[DEBUG] RSA decryption failed:', rsaError);
              throw rsaError;
            }
            
            // Step 2: Initialize AES with the decrypted key (try different key sizes)
            let aes;
            let decryptedKode, decryptedNama, decryptedNilai, sks = '0';
            
            // Try AES-256 first, then AES-128 if that fails
            try {
              aes = new AES();
              decryptedKode = aes.decrypt(record.encrypted_data.kode, decryptedAESKey);
              decryptedNama = aes.decrypt(record.encrypted_data.nama, decryptedAESKey);
              decryptedNilai = aes.decrypt(record.encrypted_data.nilai, decryptedAESKey);
            } catch (aes256Error) {
              console.log('AES default failed, trying again:', aes256Error.message);
              aes = new AES();
              decryptedKode = aes.decrypt(record.encrypted_data.kode, decryptedAESKey);
              decryptedNama = aes.decrypt(record.encrypted_data.nama, decryptedAESKey);
              decryptedNilai = aes.decrypt(record.encrypted_data.nilai, decryptedAESKey);
            }
            
            // Step 4: Get SKS from mata kuliah data (if available) or from encrypted data
            if (record.encrypted_data.sks) {
              sks = aes.decrypt(record.encrypted_data.sks, decryptedAESKey);
            } else {
              // If SKS is not encrypted, try to get it from available courses
              const matchingCourse = availableCourses.find(course => 
                course.kode === decryptedKode
              );
              if (matchingCourse) {
                sks = matchingCourse.sks;
              }
            }

            decryptedGrades.push({
              id: record.id,
              kode: decryptedKode,
              nama: decryptedNama,
              nilai: decryptedNilai,
              sks: sks,
              nip_dosen: record.nip_dosen
            });
            
            successful++;
          } catch (decryptError) {
            console.error('Error decrypting record:', decryptError);
            failed++;
            // Don't show toast for each failed record to avoid spam
          }
          
          // Update decryption progress
          setDecryptionStats({ 
            total, 
            successful, 
            failed 
          });
        }

        setStudentGrades(decryptedGrades);
        
        // Show final results
        if (successful > 0) {
          toast.success(`Successfully decrypted ${successful} out of ${total} grade records.`);
        }
        
        if (failed > 0) {
          toast.warning(`Failed to decrypt ${failed} out of ${total} grade records.`);
        }
        
        if (decryptedGrades.length === 0 && encryptedRecords.length > 0) {
          setGradesError('Failed to decrypt all grade records. Please check your credentials or contact support.');
        }
      } else {
        setGradesError(response.message || 'No grades found');
        setStudentGrades([]);
      }
    } catch (error) {
      console.error('Error loading student grades:', error);
      setGradesError(`Error loading grades: ${error.message}`);
      setStudentGrades([]);
    } finally {
      setIsLoadingGrades(false);
      setIsDecryptingGrades(false);
    }
  };

  const navigationItems = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    ...(userData?.type === 'mahasiswa' ? [{ id: 'grades', label: 'My Grades', icon: BookOpen }] : []),
    ...(userData?.type === 'dosen_wali' ? [
      { id: 'academic', label: 'Academic Data', icon: GraduationCap },
      { id: 'view-student', label: 'View Student Records', icon: FileText },
      { id: 'group-requests', label: 'Group Based Decryption', icon: Users }
    ] : []),
    ...(userData?.type === 'kaprodi' ? [
      { id: 'courses', label: 'Course Management', icon: Settings },
      { id: 'view-student', label: 'View Student Records', icon: FileText }
    ] : []),
  ];

  const cryptoFeatures = [
    {
      name: 'RSA Encryption',
      description: 'Digital signatures and key exchange',
      status: 'Active',
      icon: Key
    },
    {
      name: 'AES Encryption',
      description: 'Symmetric encryption for data protection',
      status: 'Active',
      icon: Lock
    },
    {
      name: 'Shamir Secret Sharing',
      description: 'Distributed key management',
      status: 'Active',
      icon: Shield
    }
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Welcome to Sixvault</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Your Profile</h4>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">NIM/NIP:</span> {userData?.nim_nip}</p>
              <p><span className="font-medium">Name:</span> {userData?.nama}</p>
              <p><span className="font-medium">Type:</span> {userData?.type}</p>
              <p><span className="font-medium">Program:</span> {userData?.prodi}</p>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Security Status</h4>
            <div className="space-y-2">
              {cryptoFeatures.map((feature, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-700">{feature.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {cryptoFeatures.map((feature, index) => (
          <div key={index} className="card bg-gradient-to-br from-blue-50 to-indigo-50">
            <feature.icon className="h-8 w-8 text-primary-600 mb-3" />
            <h4 className="font-semibold text-gray-900 mb-2">{feature.name}</h4>
            <p className="text-sm text-gray-600 mb-3">{feature.description}</p>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              {feature.status}
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );

  const renderSecurity = () => (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <h3 className="text-xl font-semibold text-gray-900 mb-4">RSA Key Pair</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Public Key
            </label>
            <textarea
              readOnly
              value={rsaKeys?.publicKey || 'Loading...'}
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-xs font-mono"
              rows={4}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Private Key (Protected)
            </label>
            <textarea
              readOnly
              value="••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"
              className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-xs font-mono"
              rows={4}
            />
            <p className="text-xs text-gray-500 mt-1">
              Private key is securely stored and encrypted
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const renderAcademicData = () => {

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Input Academic Data</h3>
          
          {/* Info note for dosen_wali */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
            <div className="flex items-start space-x-2">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Academic Advisor Access</p>
                <p>
                  As a Dosen Wali, you can input academic data for students assigned to you. The system will automatically create secure keys for the student, yourself, and the program head (Kaprodi) to ensure proper access control.
                </p>
              </div>
            </div>
          </div>
          
          {/* Student Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NIM
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={studentData.nim}
                  onChange={(e) => handleStudentChange('nim', e.target.value)}
                  className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter student NIM"
                />
                <button
                  onClick={handleSearchStudent}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Search
                </button>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={studentData.namaLengkap}
                onChange={(e) => handleStudentChange('namaLengkap', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Full name"
              />
            </div>
          </div>

          {/* Courses Table */}
          <div className="mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Mata Kuliah (Courses)</h4>
            
            {isLoadingAvailableCourses ? (
              <div className="bg-yellow-50 p-3 rounded-lg mb-4">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600"></div>
                  <p className="text-sm text-yellow-800">Loading available courses...</p>
                </div>
              </div>
            ) : availableCourses.length === 0 ? (
              <div className="bg-red-50 p-3 rounded-lg mb-4">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-red-800">
                    <p className="font-medium">No courses available</p>
                    <p className="text-xs">Please contact your administrator or refresh the page to try again.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 p-3 rounded-lg mb-4">
                <div className="flex items-start space-x-2">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How to use autocomplete ({availableCourses.length} courses available):</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Type at least 2 characters in <strong>Kode MK</strong> or <strong>Nama Mata Kuliah</strong> fields</li>
                      <li>Select from the dropdown suggestions or use arrow keys to navigate</li>
                      <li>Press Enter to select or click on a suggestion</li>
                      <li>All fields (Kode, Nama, SKS) will be automatically filled</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">No</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Kode MK</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Nama Mata Kuliah</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">SKS</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Indeks</th>
                  </tr>
                </thead>
                <tbody>
                  {studentData.mataKuliah.map((mk, index) => (
                                          <tr key={index}>
                        <td className="border border-gray-300 px-4 py-2 text-sm">{index + 1}</td>
                        <td className="border border-gray-300 px-2 py-2 relative">
                          <input
                            type="text"
                            value={mk.kode}
                            onChange={(e) => handleCourseAutocompleteChange(index, 'kode', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'kode')}
                            onBlur={() => handleBlur(index, 'kode')}
                            disabled={isLoadingAvailableCourses}
                            className={`w-full p-2 border-0 focus:ring-1 focus:ring-primary-500 text-sm ${
                              isLoadingAvailableCourses ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                            placeholder={isLoadingAvailableCourses ? "Loading courses..." : "e.g., IF3020"}
                            autoComplete="off"
                          />
                          {/* Suggestions dropdown for Kode */}
                          {showSuggestions[`${index}_kode`] && courseSuggestions[`${index}_kode`] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                              {courseSuggestions[`${index}_kode`].map((course, suggestionIndex) => (
                                <div
                                  key={`${course.kode}-${suggestionIndex}`}
                                  className={`px-3 py-2 cursor-pointer text-sm ${
                                    activeSuggestionIndex[`${index}_kode`] === suggestionIndex
                                      ? 'bg-primary-100 text-primary-900'
                                      : 'hover:bg-gray-100'
                                  }`}
                                  onClick={() => handleCourseSelect(index, course)}
                                >
                                  <div className="font-medium">{course.kode}</div>
                                  <div className="text-xs text-gray-600 truncate">{course.nama}</div>
                                  <div className="text-xs text-gray-500">{course.sks} SKS</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 relative">
                          <input
                            type="text"
                            value={mk.nama}
                            onChange={(e) => handleCourseAutocompleteChange(index, 'nama', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'nama')}
                            onBlur={() => handleBlur(index, 'nama')}
                            disabled={isLoadingAvailableCourses}
                            className={`w-full p-2 border-0 focus:ring-1 focus:ring-primary-500 text-sm ${
                              isLoadingAvailableCourses ? 'bg-gray-100 cursor-not-allowed' : ''
                            }`}
                            placeholder={isLoadingAvailableCourses ? "Loading courses..." : "Course name"}
                            autoComplete="off"
                          />
                          {/* Suggestions dropdown for Nama */}
                          {showSuggestions[`${index}_nama`] && courseSuggestions[`${index}_nama`] && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                              {courseSuggestions[`${index}_nama`].map((course, suggestionIndex) => (
                                <div
                                  key={`${course.kode}-${suggestionIndex}`}
                                  className={`px-3 py-2 cursor-pointer text-sm ${
                                    activeSuggestionIndex[`${index}_nama`] === suggestionIndex
                                      ? 'bg-primary-100 text-primary-900'
                                      : 'hover:bg-gray-100'
                                  }`}
                                  onClick={() => handleCourseSelect(index, course)}
                                >
                                  <div className="font-medium">{course.kode}</div>
                                  <div className="text-xs text-gray-600 truncate">{course.nama}</div>
                                  <div className="text-xs text-gray-500">{course.sks} SKS</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="border border-gray-300 px-2 py-2">
                          <input
                            type="text"
                            value={mk.sks}
                            disabled={true}
                            className="w-full p-2 border-0 bg-gray-50 text-gray-600 text-sm text-center cursor-not-allowed"
                            placeholder="Auto-filled"
                            title="SKS will be automatically filled when you select a course"
                          />
                        </td>
                        <td className="border border-gray-300 px-2 py-2">
                          <select
                            value={mk.indeks}
                            onChange={(e) => handleCourseChange(index, 'indeks', e.target.value)}
                            className="w-full p-2 border-0 focus:ring-1 focus:ring-primary-500 text-sm"
                          >
                            <option value="A">A</option>
                            <option value="AB">AB</option>
                            <option value="B">B</option>
                            <option value="BC">BC</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* IPK Display */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium text-gray-900">IPK (Indeks Prestasi Kumulatif)</h4>
              <div className="text-2xl font-bold text-primary-600">
                {ipk.toFixed(2)}
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Calculated automatically based on entered grades and credits
            </p>
          </div>

          {/* Encryption key — asked for at the moment encryption is performed,
              as the specification requires. Each record's AES key is derived
              from it; the key itself is never sent to the server. */}
          <div className="bg-amber-50 p-4 rounded-lg mb-6 border border-amber-200">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Encryption Key <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={encryptionPassphrase}
              onChange={(e) => setEncryptionPassphrase(e.target.value)}
              autoComplete="off"
              className="input-field"
              placeholder="Enter the key used to encrypt these records"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-600 mt-2">
              Each record is encrypted under its own key, derived from this one as
              SHA3(key ‖ NIM ‖ course code). The key never leaves this device —
              only the derived per-record keys are sent, which the server needs in
              order to split and wrap them. Keep it: the same key always derives
              the same record keys.
            </p>
          </div>

          {/* Submit Button */}
                    <div className="flex justify-end">
            <button
              onClick={handleSubmitAcademicData}
              disabled={isSubmitting || !studentData.nim || !studentData.namaLengkap || !encryptionPassphrase.trim() || isLoadingAvailableCourses}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            >
              {isSubmitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              <span>
                {isSubmitting ? 'Submitting...' :
                 isLoadingAvailableCourses ? 'Loading courses...' :
                 !encryptionPassphrase.trim() ? 'Enter an encryption key' :
                 'Submit Academic Data'}
              </span>
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderCourseManagement = () => {
    const programDisplayName = userData?.prodi === 'teknik_informatika' 
      ? 'Teknik Informatika' 
      : 'Sistem dan Teknologi Informasi';

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Course Management - {programDisplayName}
          </h3>
          
          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 mb-6">
            <button
              onClick={addPredefinedCourses}
              disabled={isAddingCourses}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isAddingCourses ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span>{isAddingCourses ? 'Adding...' : 'Add Predefined Courses'}</span>
            </button>
            
            <button
              onClick={removeSelectedCourses}
              disabled={isRemovingCourses || selectedCourses.length === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isRemovingCourses ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span>{isRemovingCourses ? 'Removing...' : `Remove Selected (${selectedCourses.length})`}</span>
            </button>
            
            <button
              onClick={loadExistingCourses}
              disabled={isLoadingCourses}
              className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              <Settings className="h-4 w-4" />
              <span>Refresh</span>
            </button>
          </div>

          {/* Course Statistics */}
          {existingCourses.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{existingCourses.length}</div>
                  <div className="text-sm text-gray-600">Total Courses</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{selectedCourses.length}</div>
                  <div className="text-sm text-gray-600">Selected</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">
                    {existingCourses.reduce((sum, course) => sum + parseInt(course.sks || 0), 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total SKS</div>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoadingCourses && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading courses...</p>
            </div>
          )}

          {/* Course List */}
          {!isLoadingCourses && existingCourses.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={selectedCourses.length === existingCourses.length && existingCourses.length > 0}
                        onChange={selectAllCourses}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Kode</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">Nama Mata Kuliah</th>
                    <th className="border border-gray-300 px-4 py-2 text-left text-sm font-medium text-gray-700">SKS</th>
                  </tr>
                </thead>
                <tbody>
                  {existingCourses.map((course, index) => (
                    <tr key={course.kode || index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedCourses.includes(course.kode)}
                          onChange={() => toggleCourseSelection(course.kode)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-sm font-mono">{course.kode}</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm">{course.nama || course.matakuliah}</td>
                      <td className="border border-gray-300 px-4 py-2 text-sm text-center">{course.sks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingCourses && existingCourses.length === 0 && (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No courses found for {programDisplayName}</p>
              <button
                onClick={addPredefinedCourses}
                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors mx-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Add Predefined Courses</span>
              </button>
            </div>
          )}
        </motion.div>

        {/* Predefined Courses Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
          className="card"
        >
          <h4 className="text-lg font-semibold text-gray-900 mb-4">
            Available Predefined Courses for {programDisplayName}
          </h4>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">
              {predefinedCourses[userData?.prodi]?.length || 0} courses available
            </p>
            <div className="text-xs text-gray-500">
              Click "Add Predefined Courses" to add all courses for your program study.
              You can then remove individual courses using the checkboxes above.
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderStudentGrades = () => {
    // Calculate GPA
    const calculateGPA = () => {
      if (studentGrades.length === 0) return 0;
      
      const validGrades = studentGrades.filter(grade => 
        grade.nilai && grade.sks && gradePoints[grade.nilai]
      );
      
      if (validGrades.length === 0) return 0;
      
      const totalPoints = validGrades.reduce((sum, grade) => {
        return sum + (gradePoints[grade.nilai] * parseInt(grade.sks || 0));
      }, 0);
      
      const totalSks = validGrades.reduce((sum, grade) => {
        return sum + parseInt(grade.sks || 0);
      }, 0);
      
      return totalSks > 0 ? totalPoints / totalSks : 0;
    };

    const gpa = calculateGPA();
    const totalSks = studentGrades.reduce((sum, grade) => sum + parseInt(grade.sks || 0), 0);

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6">My Academic Grades</h3>
          
          {/* GPA Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{gpa.toFixed(2)}</div>
              <div className="text-sm opacity-90">Grade Point Average</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{studentGrades.length}</div>
              <div className="text-sm opacity-90">Total Courses</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{totalSks}</div>
              <div className="text-sm opacity-90">Total Credits (SKS)</div>
            </div>
          </div>

          {/* Loading State */}
          {isLoadingGrades && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your encrypted grades...</p>
            </div>
          )}

          {/* Decryption State */}
          {isDecryptingGrades && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-600 mb-2">Decrypting your grades...</p>
              {decryptionStats.total > 0 && (
                <div className="text-sm text-gray-500">
                  <p>Progress: {decryptionStats.successful + decryptionStats.failed} / {decryptionStats.total}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 max-w-xs mx-auto">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${((decryptionStats.successful + decryptionStats.failed) / decryptionStats.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error State */}
          {gradesError && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-200 mb-6">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-red-800 font-medium">Error loading grades</p>
                  <p className="text-red-600 text-sm">{gradesError}</p>
                </div>
              </div>
              <button
                onClick={loadStudentGrades}
                disabled={isLoadingGrades || isDecryptingGrades}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isLoadingGrades || isDecryptingGrades ? 'Loading...' : 'Try Again'}
              </button>
            </div>
          )}

          {/* Security Info */}
          {!isLoadingGrades && !isDecryptingGrades && studentGrades.length > 0 && (
            <div className="bg-green-50 p-4 rounded-lg border border-green-200 mb-6">
              <div className="flex items-start space-x-2">
                <Shield className="h-5 w-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-green-800 font-medium">Secure Decryption Complete</p>
                  <p className="text-green-600 text-sm">
                    Your grades were securely decrypted using your private RSA key and AES encryption. 
                    {decryptionStats.total > 0 && (
                      <span> Successfully processed {decryptionStats.successful} out of {decryptionStats.total} records.</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Signature Status */}
          {!isLoadingGrades && !isDecryptingGrades && studentGrades.length > 0 && (
            <div className="mb-6">
              {(() => {
                                 const signature = getSignatureForStudent(userData?.nim_nip);
                 if (signature) {
                   const verificationResult = verifySignature(
                     signature,
                     studentGrades,
                     userData?.nim_nip,
                     userData?.nama
                   );
                   const isVerified = verificationResult === 'verified';
                  
                                     return (
                     <div className={`p-4 rounded-lg border ${
                       isVerified 
                         ? 'bg-blue-50 border-blue-200' 
                         : 'bg-red-50 border-red-200'
                     }`}>
                       <div className="flex items-start space-x-2">
                         <div className="text-lg">
                           {isVerified ? '✅' : '❌'}
                         </div>
                         <div className="flex-1">
                           <p className={`font-medium ${
                             isVerified ? 'text-blue-800' : 'text-red-800'
                           }`}>
                             Academic Records {isVerified ? 'Verified' : 'Verification Failed'} by Program Head
                           </p>
                           <p className={`text-sm ${
                             isVerified ? 'text-blue-600' : 'text-red-600'
                           }`}>
                             {isVerified 
                               ? 'Your academic records have been digitally signed and verified by the program head (Kaprodi).'
                               : 'Signature verification failed. The academic data may have been tampered with or the signature is invalid.'
                             }
                           </p>
                           {signature.signature && (
                             <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                               <p className="font-medium text-gray-700 mb-1">Digital Signature (SHA3):</p>
                               <p className="font-mono text-gray-600 break-all">{signature.signature}</p>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>
                   );
                } else {
                  return (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="flex items-start space-x-2">
                        <div className="text-lg">📝</div>
                        <div>
                          <p className="text-gray-800 font-medium">Academic Records Unsigned</p>
                          <p className="text-gray-600 text-sm">
                            Your academic records have not yet been digitally signed by the program head (Kaprodi).
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
              })()}
            </div>
          )}

          {/* Records that fail verification are withheld until acknowledged. */}
          {!isLoadingGrades && !isDecryptingGrades && !gradesError && studentGrades.length > 0 &&
            isUnverifiedWithheld(userData?.nim_nip, studentGradesVerification) &&
            renderWithheldRecords(userData?.nim_nip)}

          {/* Grades Table */}
          {!isLoadingGrades && !isDecryptingGrades && !gradesError && studentGrades.length > 0 &&
           !isUnverifiedWithheld(userData?.nim_nip, studentGradesVerification) && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">No</th>
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Course Code</th>
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Course Name</th>
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Credits</th>
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Grade</th>
                    <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {studentGrades.map((grade, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-4 py-3 text-sm">{index + 1}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm font-mono">{grade.kode}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">{grade.nama}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm text-center">{grade.sks}</td>
                      <td className="border border-gray-300 px-4 py-3 text-sm text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          grade.nilai === 'A' ? 'bg-green-100 text-green-800' :
                          grade.nilai === 'AB' ? 'bg-blue-100 text-blue-800' :
                          grade.nilai === 'B' ? 'bg-indigo-100 text-indigo-800' :
                          grade.nilai === 'BC' ? 'bg-purple-100 text-purple-800' :
                          grade.nilai === 'C' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {grade.nilai}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm text-center">
                        {gradePoints[grade.nilai] ? gradePoints[grade.nilai].toFixed(1) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Download Transcript Button */}
          {!isLoadingGrades && !isDecryptingGrades && !gradesError && studentGrades.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">Official Academic Transcript</h4>
                  <p className="text-sm text-gray-600">Download your complete academic transcript as a PDF document</p>
                </div>
                                 <button
                   onClick={() => handleOpenTranscriptModal(null, null, null)}
                   className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                 >
                   <FileText className="h-4 w-4" />
                   <span>Download Transcript</span>
                 </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoadingGrades && !isDecryptingGrades && !gradesError && studentGrades.length === 0 && (
            <div className="text-center py-8">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">No grades found</p>
              <p className="text-sm text-gray-500">Your academic grades will appear here once they are added by your academic advisor.</p>
              <button
                onClick={loadStudentGrades}
                disabled={isLoadingGrades || isDecryptingGrades}
                className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Refresh
              </button>
            </div>
          )}
        </motion.div>

        {/* Grade Scale Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          <div className="card">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Grade Scale</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(gradePoints).map(([grade, points]) => (
                <div key={grade} className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">{grade}</div>
                  <div className="text-sm text-gray-600">{points.toFixed(1)} points</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Security Information</h4>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start space-x-2">
                <Key className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">RSA Key Decryption</p>
                  <p>Your private RSA key decrypts the AES encryption keys stored with each grade record.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <Lock className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">AES Data Decryption</p>
                  <p>Grade data is encrypted using AES symmetric encryption for secure storage.</p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <Shield className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-gray-900">Client-Side Processing</p>
                  <p>All decryption happens in your browser - your private key never leaves your device.</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const renderViewStudentRecords = () => {
    // Calculate GPA for the viewed student
    const calculateStudentGPA = () => {
      if (viewStudentState.records.length === 0) return 0;
      
      console.log('[DEBUG] Calculating GPA for records:', viewStudentState.records);
      
      const validGrades = viewStudentState.records.filter(grade => 
        grade.nilai && grade.sks && gradePoints[grade.nilai]
      );
      
      console.log('[DEBUG] Valid grades for GPA calculation:', validGrades);
      console.log('[DEBUG] Filtered out records:', viewStudentState.records.filter(grade => 
        !grade.nilai || !grade.sks || !gradePoints[grade.nilai]
      ));
      
      if (validGrades.length === 0) return 0;
      
      const totalPoints = validGrades.reduce((sum, grade) => {
        const points = gradePoints[grade.nilai] * parseInt(grade.sks || 0);
        console.log('[DEBUG] Grade:', grade.nilai, 'SKS:', grade.sks, 'Points:', points);
        return sum + points;
      }, 0);
      
      const totalSks = validGrades.reduce((sum, grade) => {
        return sum + parseInt(grade.sks || 0);
      }, 0);
      
      console.log('[DEBUG] Total points:', totalPoints, 'Total SKS:', totalSks);
      
      return totalSks > 0 ? totalPoints / totalSks : 0;
    };

    const studentGPA = calculateStudentGPA();
    const totalSks = viewStudentState.records.reduce((sum, grade) => sum + parseInt(grade.sks || 0), 0);
    const userTypeLabel = userData?.type === 'kaprodi' ? 'Program Head' : 'Academic Advisor';

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6">View Student Academic Records</h3>
          
          {/* Info note */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
            <div className="flex items-start space-x-2">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">{userTypeLabel} Access</p>
                <p>
                  {userData?.type === 'kaprodi' 
                    ? `As a Program Head, you can view academic records for students in the ${userData?.prodi === 'teknik_informatika' ? 'Teknik Informatika' : 'Sistem dan Teknologi Informasi'} program.`
                    : 'As an Academic Advisor, you can view academic records for students assigned to you as their dosen wali. For other students in your program, you can request access through Shamir Secret Sharing consensus from your colleagues.'
                  }
                </p>
              </div>
            </div>
          </div>
          
          {/* Search Form */}
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Search Student Records</h4>
            <div className="flex space-x-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Student NIM
                </label>
                <input
                  type="text"
                  value={viewStudentState.nim}
                  onChange={(e) => handleViewStudentNimChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleViewStudentSearch()}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Enter student NIM (e.g., 13520001)"
                  disabled={viewStudentState.isLoading || viewStudentState.isDecrypting}
                />
              </div>
              <div className="flex items-end space-x-2">
                <button
                  onClick={handleViewStudentSearch}
                  disabled={viewStudentState.isLoading || viewStudentState.isDecrypting || !viewStudentState.nim.trim()}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
                >
                  {viewStudentState.isLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  <span>{viewStudentState.isLoading ? 'Searching...' : 'Search'}</span>
                </button>
                <button
                  onClick={clearViewStudentData}
                  disabled={viewStudentState.isLoading || viewStudentState.isDecrypting}
                  className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {viewStudentState.isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading student records...</p>
            </div>
          )}

          {/* Decryption State */}
          {viewStudentState.isDecrypting && (
            <div className="text-center py-8">
              <div className={`animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-4 ${
                viewStudentState.isServerSideDecryption ? 'border-purple-600' : 'border-green-600'
              }`}></div>
              <p className="text-gray-600 mb-2">
                {viewStudentState.isServerSideDecryption 
                  ? 'Decrypting student records using Shamir Secret Sharing group consensus...'
                  : 'Decrypting student records using your private key...'
                }
              </p>
              {viewStudentState.decryptionStats.total > 0 && (
                <div className="text-sm text-gray-500">
                  <p>Progress: {viewStudentState.decryptionStats.successful + viewStudentState.decryptionStats.failed} / {viewStudentState.decryptionStats.total}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2 max-w-xs mx-auto">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        viewStudentState.isServerSideDecryption ? 'bg-purple-600' : 'bg-green-600'
                      }`}
                      style={{ width: `${((viewStudentState.decryptionStats.successful + viewStudentState.decryptionStats.failed) / viewStudentState.decryptionStats.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error State */}
          {viewStudentState.error && viewStudentState.hasSearched && (
            <div className="bg-red-50 p-4 rounded-lg border border-red-200 mb-6">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="text-red-800 font-medium">Error</p>
                  <p className="text-red-600 text-sm">{viewStudentState.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Request Creation Button for Non-Assigned Students */}
          {userData?.type === 'dosen_wali' && viewStudentState.canCreateRequest && viewStudentState.hasSearched && viewStudentState.studentName && (
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200 mb-6">
              <div className="flex items-start space-x-2">
                <Users className="h-5 w-5 text-orange-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-orange-800 font-medium">Cross-Program Access Required</p>
                  <p className="text-orange-600 text-sm mb-3">
                    Student <strong>{viewStudentState.studentName}</strong> (NIM: {viewStudentState.nim}) is not assigned to you as their academic advisor. 
                    You can request access to their academic records through group-based decryption using Shamir Secret Sharing. 
                    You will automatically provide the first approval (1/3), and 2 colleague approvals will be needed.
                  </p>
                  <button
                    onClick={async () => {
                      await createAccessRequest(viewStudentState.nim, viewStudentState.studentName);
                      setViewStudentState(prev => ({ ...prev, canCreateRequest: false }));
                    }}
                    className="flex items-center space-x-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Key className="h-4 w-4" />
                    <span>Request Group Access</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Request Status for Dosen Wali */}
          {userData?.type === 'dosen_wali' && viewStudentState.hasActiveRequest && !viewStudentState.isLoading && !viewStudentState.isDecrypting && (
            <div className="space-y-4 mb-6">
              {/* Request Status Card */}
              <div className={`p-4 rounded-lg border ${
                viewStudentState.requestStatus === 'approved' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-start space-x-2">
                  <Shield className={`h-5 w-5 mt-0.5 ${
                    viewStudentState.requestStatus === 'approved' ? 'text-green-600' : 'text-yellow-600'
                  }`} />
                  <div className="flex-1">
                    <p className={`font-medium ${
                      viewStudentState.requestStatus === 'approved' ? 'text-green-800' : 'text-yellow-800'
                    }`}>
                      {viewStudentState.requestStatus === 'approved' 
                        ? 'Access Request Approved' 
                        : 'Access Request Pending'}
                    </p>
                    <p className={`text-sm mt-1 ${
                      viewStudentState.requestStatus === 'approved' ? 'text-green-600' : 'text-yellow-600'
                    }`}>
                      {viewStudentState.requestStatus === 'approved'
                        ? `Your request to view ${viewStudentState.studentName}'s academic records has been approved through Shamir Secret Sharing consensus.`
                        : `Your request to view ${viewStudentState.studentName}'s academic records is waiting for colleague approval. You auto-approved (1/3), ${(viewStudentState.approvals || []).filter(a => a.approved).length} of ${viewStudentState.requiredApprovals} total approvals received. The student's own academic advisor must be one of the approvers.`
                      }
                    </p>
                    
                    {/* Approval Progress */}
                    {viewStudentState.requestStatus === 'pending' && viewStudentState.approvals.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                          <span>Approval Progress</span>
                          <span>{viewStudentState.approvals.filter(a => a.approved).length} / {viewStudentState.requiredApprovals}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-yellow-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(viewStudentState.approvals.filter(a => a.approved).length / viewStudentState.requiredApprovals) * 100}%` }}
                          ></div>
                        </div>
                        
                        {/* Approval Details */}
                        <div className="mt-2 space-y-1">
                          {viewStudentState.approvals.map((approval, index) => (
                            <div key={index} className="flex items-center justify-between text-xs">
                              <span className="text-gray-600">Faculty NIP: {approval.nip}</span>
                              <span className={`font-medium ${approval.approved ? 'text-green-600' : 'text-gray-400'}`}>
                                {approval.approved ? '✓ Approved' : '⏳ Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shamir Secret Sharing Info */}
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="flex items-start space-x-2">
                  <Key className="h-5 w-5 text-purple-600 mt-0.5" />
                  <div>
                    <p className="text-purple-800 font-medium">Shamir Secret Sharing Access Control</p>
                    <p className="text-purple-600 text-sm mt-1">
                      To access this student's encrypted academic records, a minimum of {viewStudentState.requiredApprovals} faculty members 
                      from your program must approve the request. You automatically provide the first approval, and {viewStudentState.requiredApprovals - 1} additional 
                      colleague approvals are needed. This ensures secure, distributed access control where no single 
                      person can access student data without proper authorization.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Requests for Approval (Dosen Wali) */}
          {userData?.type === 'dosen_wali' && requestManagementState.pendingRequests.length > 0 && activeTab === 'view-student' && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Pending Approval Requests</h4>
              <p className="text-sm text-blue-700 mb-4">
                You have {requestManagementState.pendingRequests.filter(req => 
                  req.requester_nip !== userData.nim_nip && 
                  !(req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
                ).length} requests waiting for your approval.
              </p>
              
              <div className="space-y-3">
                {requestManagementState.pendingRequests
                  .filter(req => 
                    req.requester_nip !== userData.nim_nip && 
                    !(req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
                  )
                  .slice(0, 3)
                  .map((request, index) => (
                    <div key={index} className="bg-white p-3 rounded border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Student NIM: {request.nim}
                          </p>
                          <p className="text-xs text-gray-600">
                            Requested by: NIP {request.requester_nip}
                          </p>
                          <p className="text-xs text-gray-500">
                            Approvals: {(request.approvals || []).filter(a => a.approved).length} / {viewStudentState.requiredApprovals}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleApproveRequest(request.nim, request.requester_nip, true)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveRequest(request.nim, request.requester_nip, false)}
                            className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {requestManagementState.pendingRequests.filter(req =>
                req.requester_nip !== userData.nim_nip && 
                !(req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
              ).length > 3 && (
                <p className="text-xs text-blue-600 mt-2">
                  ...and {requestManagementState.pendingRequests.filter(req => 
                    req.requester_nip !== userData.nim_nip && 
                    !(req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
                  ).length - 3} more requests.
                </p>
              )}
            </div>
          )}

          {/* Student Info and Results */}
          {!viewStudentState.isLoading && !viewStudentState.isDecrypting && viewStudentState.hasSearched && viewStudentState.studentName && !viewStudentState.error && (
            <div className="space-y-6">
              {/* Group-Based Access Notification */}
              {viewStudentState.isServerSideDecryption && viewStudentState.requestStatus === 'approved' && (
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex items-start space-x-2">
                    <Users className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="text-purple-800 font-medium">Group-Based Access Granted</p>
                      <p className="text-purple-600 text-sm mt-1">
                        You are viewing this student's academic records through <strong>Shamir Secret Sharing group-based decryption</strong>. 
                        This access was granted after obtaining the required 3/3 faculty approvals from your colleagues. 
                        The decryption was performed server-side using the reconstructed keys from the approved consensus.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Student Header */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Student Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p><span className="font-medium">NIM:</span> {viewStudentState.nim}</p>
                    <p><span className="font-medium">Name:</span> {viewStudentState.studentName}</p>
                    {viewStudentState.isServerSideDecryption && (
                      <p><span className="font-medium">Access Method:</span> <span className="text-purple-600 font-medium">Group-Based Decryption</span></p>
                    )}
                  </div>
                  <div>
                    <p><span className="font-medium">Total Records:</span> {viewStudentState.records.length}</p>
                    {viewStudentState.decryptionStats.total > 0 && (
                      <p><span className="font-medium">Decryption Success:</span> {viewStudentState.decryptionStats.successful} / {viewStudentState.decryptionStats.total}</p>
                    )}
                    {viewStudentState.isServerSideDecryption && (
                      <p><span className="font-medium">Decryption Type:</span> Server-Side</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Academic Summary */}
              {viewStudentState.records.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
                    <div className="text-2xl font-bold">{studentGPA.toFixed(2)}</div>
                    <div className="text-sm opacity-90">Grade Point Average</div>
                  </div>
                  <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
                    <div className="text-2xl font-bold">{viewStudentState.records.length}</div>
                    <div className="text-sm opacity-90">Total Courses</div>
                  </div>
                  <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
                    <div className="text-2xl font-bold">{totalSks}</div>
                    <div className="text-sm opacity-90">Total Credits (SKS)</div>
                  </div>
                </div>
              )}

              {/* Security Info */}
              {viewStudentState.records.length > 0 && (
                <div className={`p-4 rounded-lg border ${
                  viewStudentState.isServerSideDecryption 
                    ? 'bg-purple-50 border-purple-200' 
                    : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-start space-x-2">
                    <Shield className={`h-5 w-5 mt-0.5 ${
                      viewStudentState.isServerSideDecryption ? 'text-purple-600' : 'text-green-600'
                    }`} />
                    <div>
                      <p className={`font-medium ${
                        viewStudentState.isServerSideDecryption ? 'text-purple-800' : 'text-green-800'
                      }`}>
                        {viewStudentState.isServerSideDecryption 
                          ? 'Group-Based Decryption Complete' 
                          : 'Secure Decryption Complete'}
                      </p>
                      <p className={`text-sm ${
                        viewStudentState.isServerSideDecryption ? 'text-purple-600' : 'text-green-600'
                      }`}>
                        {viewStudentState.isServerSideDecryption 
                          ? 'Student records were securely decrypted using Shamir Secret Sharing group consensus and server-side decryption. The required 3/3 faculty approvals were obtained to reconstruct the decryption keys.'
                          : 'Student records were securely decrypted using your private RSA key and AES encryption on the client side.'
                        }
                        {viewStudentState.decryptionStats.total > 0 && (
                          <span> Successfully processed {viewStudentState.decryptionStats.successful} out of {viewStudentState.decryptionStats.total} records.</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Signature Status */}
              {viewStudentState.records.length > 0 && (
                <div className="mb-6">
                  {(() => {
                                         const signature = getSignatureForStudent(viewStudentState.nim);
                     if (signature) {
                       const verificationResult = verifySignature(
                         signature,
                         viewStudentState.records,
                         viewStudentState.nim,
                         viewStudentState.studentName
                       );
                       const isVerified = verificationResult === 'verified';
                       const verificationFailed = verificationResult === 'tampered';
                      
                                             return (
                         <div className={`p-4 rounded-lg border ${
                           isVerified 
                             ? 'bg-blue-50 border-blue-200' 
                             : 'bg-red-50 border-red-200'
                         }`}>
                           <div className="flex items-start space-x-2">
                             <div className="text-lg">
                               {isVerified ? '✅' : '❌'}
                             </div>
                             <div className="flex-1">
                               <p className={`font-medium ${
                                 isVerified ? 'text-blue-800' : 'text-red-800'
                               }`}>
                                 Academic Records {isVerified ? 'Verified' : 'Verification Failed'} by Program Head
                               </p>
                               <p className={`text-sm ${
                                 isVerified ? 'text-blue-600' : 'text-red-600'
                               }`}>
                                 {isVerified 
                                   ? 'These academic records have been digitally signed and verified by the program head (Kaprodi).'
                                   : 'Signature verification failed. The academic data may have been tampered with or the signature is invalid.'
                                 }
                               </p>
                               {signature.signature && (
                                 <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                                   <p className="font-medium text-gray-700 mb-1">Digital Signature (SHA3):</p>
                                   <p className="font-mono text-gray-600 break-all">{signature.signature}</p>
                                 </div>
                               )}
                               {/* Re-signing must stay available. There is one
                                   signature per student covering all their
                                   records, so adding a grade invalidates it —
                                   and the control used to disappear as soon as
                                   a signature existed, leaving no way to
                                   restore a valid one. */}
                               {userData?.type === 'kaprodi' && (
                                 <button
                                   onClick={() => signStudentGrades(viewStudentState.nim, viewStudentState.records, viewStudentState.studentName)}
                                   disabled={isSigningGrades}
                                   className="mt-3 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                                 >
                                   {isSigningGrades ? (
                                     <>
                                       <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                       Re-signing...
                                     </>
                                   ) : (
                                     <>
                                       <FileText className="h-4 w-4 mr-2" />
                                       {verificationFailed ? 'Re-sign Records' : 'Re-sign (after adding grades)'}
                                     </>
                                   )}
                                 </button>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                    } else {
                      return (
                        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex items-start space-x-2">
                            <div className="text-lg">📝</div>
                            <div className="flex-grow">
                              <p className="text-gray-800 font-medium">Academic Records Unsigned</p>
                              <p className="text-gray-600 text-sm mb-3">
                                These academic records have not yet been digitally signed by the program head (Kaprodi).
                              </p>
                              {/* Sign Button for Kaprodi */}
                              {userData?.type === 'kaprodi' && (
                                <button
                                  onClick={() => signStudentGrades(viewStudentState.nim, viewStudentState.records, viewStudentState.studentName)}
                                  disabled={isSigningGrades}
                                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
                                >
                                  {isSigningGrades ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                      Signing...
                                    </>
                                  ) : (
                                    <>
                                      <FileText className="h-4 w-4 mr-2" />
                                      Sign Academic Records
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}

              {/* Download Transcript Button for View Student Records */}
              {viewStudentState.records.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900">Generate Academic Transcript</h4>
                      <p className="text-sm text-gray-600">Generate an official academic transcript PDF for {viewStudentState.studentName}</p>
                    </div>
                    <button
                      onClick={() => handleOpenTranscriptModal(viewStudentState.nim, viewStudentState.studentName, viewStudentState.records)}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Generate Transcript</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Withheld when the records do not match the signature. */}
              {viewStudentState.records.length > 0 &&
                isUnverifiedWithheld(viewStudentState.nim, viewStudentVerification) &&
                renderWithheldRecords(viewStudentState.nim)}

              {/* Records Table */}
              {viewStudentState.records.length > 0 &&
               !isUnverifiedWithheld(viewStudentState.nim, viewStudentVerification) && (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">No</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Course Code</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Course Name</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Credits</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Grade</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Points</th>
                        <th className="border border-gray-300 px-4 py-3 text-left text-sm font-medium text-gray-700">Lecturer NIP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewStudentState.records.map((grade, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border border-gray-300 px-4 py-3 text-sm">{index + 1}</td>
                          <td className="border border-gray-300 px-4 py-3 text-sm font-mono">{grade.kode}</td>
                          <td className="border border-gray-300 px-4 py-3 text-sm">{grade.nama}</td>
                          <td className="border border-gray-300 px-4 py-3 text-sm text-center">{grade.sks}</td>
                          <td className="border border-gray-300 px-4 py-3 text-sm text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              grade.nilai === 'A' ? 'bg-green-100 text-green-800' :
                              grade.nilai === 'AB' ? 'bg-blue-100 text-blue-800' :
                              grade.nilai === 'B' ? 'bg-indigo-100 text-indigo-800' :
                              grade.nilai === 'BC' ? 'bg-purple-100 text-purple-800' :
                              grade.nilai === 'C' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {grade.nilai}
                            </span>
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-sm text-center">
                            {gradePoints[grade.nilai] ? gradePoints[grade.nilai].toFixed(1) : '-'}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-sm font-mono">{grade.nip_dosen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Empty Records State */}
              {viewStudentState.records.length === 0 && viewStudentState.hasSearched && !viewStudentState.error && (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">No academic records found</p>
                  <p className="text-sm text-gray-500">This student doesn't have any recorded grades yet.</p>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Additional Information Cards */}
        {!viewStudentState.isLoading && !viewStudentState.isDecrypting && viewStudentState.records.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.1 } }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <div className="card">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Grade Scale</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(gradePoints).map(([grade, points]) => (
                  <div key={grade} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{grade}</div>
                    <div className="text-sm text-gray-600">{points.toFixed(1)} points</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Access Control Information</h4>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start space-x-2">
                  <Users className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Role-Based Access</p>
                    <p>Only authorized staff can view student records based on their role and assignment.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Key className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Cryptographic Security</p>
                    <p>All academic data is encrypted and requires proper decryption keys for access.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Shield className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-900">Privacy Protection</p>
                    <p>Student data is protected through multi-layer encryption and access controls.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  const renderGroupBasedDecryption = () => {
    console.log('[DEBUG] renderGroupBasedDecryption - All pending requests:', requestManagementState.pendingRequests);
    console.log('[DEBUG] renderGroupBasedDecryption - All approved requests:', requestManagementState.approvedRequests);
    console.log('[DEBUG] renderGroupBasedDecryption - Current user NIP:', userData.nim_nip);
    
    // Combine pending and approved requests for "My Requests" section
    const myPendingRequests = requestManagementState.pendingRequests.filter(req => 
      req.requester_nip === userData.nim_nip
    );
    
    const myApprovedRequests = requestManagementState.approvedRequests.filter(req => 
      req.requester_nip === userData.nim_nip
    );
    
    // Combine and deduplicate (in case a request appears in both arrays during transition)
    const allMyRequestsMap = new Map();
    [...myPendingRequests, ...myApprovedRequests].forEach(req => {
      const key = `${req.nim}-${req.requester_nip}`;
      allMyRequestsMap.set(key, req);
    });
    const myRequests = Array.from(allMyRequestsMap.values());
    
    console.log('[DEBUG] renderGroupBasedDecryption - myPendingRequests:', myPendingRequests);
    console.log('[DEBUG] renderGroupBasedDecryption - myApprovedRequests:', myApprovedRequests);
    console.log('[DEBUG] renderGroupBasedDecryption - combined myRequests:', myRequests);
    
    const requestsToApprove = requestManagementState.pendingRequests.filter(req => 
      req.requester_nip !== userData.nim_nip &&
      !(req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
    );
    
    const myApprovedRequests2 = requestManagementState.pendingRequests.filter(req => 
      req.requester_nip !== userData.nim_nip &&
      (req.approvals || []).some(approval => approval.nip === userData.nim_nip && approval.approved)
    );
    
    console.log('[DEBUG] renderGroupBasedDecryption - requestsToApprove:', requestsToApprove);
    console.log('[DEBUG] renderGroupBasedDecryption - myApprovedRequests2:', myApprovedRequests2);

    return (
      <div className="space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Group Based Decryption Management</h3>
          
          {/* Info Section */}
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200 mb-6">
            <div className="flex items-start space-x-2">
              <Users className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <p className="text-purple-800 font-medium">Shamir Secret Sharing Protocol</p>
                <p className="text-purple-600 text-sm mt-1">
                  This dashboard manages cross-program access requests using Shamir Secret Sharing. When a faculty member
                  requests access to a student's records outside their direct supervision, a minimum of 3 faculty approvals
                  are required to reconstruct the decryption key and grant access. The requester automatically provides the
                  first approval (1/3), and 2 additional colleague approvals are needed.
                </p>
                <p className="text-purple-700 text-sm mt-2 font-medium">
                  Two conditions must both hold: at least 3 approvals, and the
                  student's own academic advisor must be one of the approvers.
                  Reaching 3 approvals without the advisor does not grant access.
                  Only faculty who hold a share of a student's key may approve.
                </p>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{myRequests.length}</div>
              <div className="text-sm opacity-90">My Requests</div>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{requestsToApprove.length}</div>
              <div className="text-sm opacity-90">Pending Approval</div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{myApprovedRequests2.length}</div>
              <div className="text-sm opacity-90">I Approved</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-lg">
              <div className="text-2xl font-bold">{requestManagementState.pendingRequests.length + requestManagementState.approvedRequests.length}</div>
              <div className="text-sm opacity-90">Total Active</div>
            </div>
          </div>

          {/* My Requests Section */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">My Access Requests</h4>
            {myRequests.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No active requests</p>
                <p className="text-sm text-gray-500">Requests you create will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myRequests.map((request, index) => {
                  const approvedCount = (request.approvals || []).filter(a => a.approved).length;
                  const isApproved = request.status === 'approved' || approvedCount >= 3;
                  
                  return (
                    <div key={index} className={`p-4 rounded-lg border ${
                      isApproved ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <p className="font-semibold text-gray-900">Student NIM: {request.nim}</p>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              isApproved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {isApproved ? 'Approved' : 'Pending'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Created: {new Date(request.created_at).toLocaleString()}
                          </p>
                          
                          {/* Progress Bar */}
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                              <span>Approval Progress</span>
                              <span>{approvedCount} / 3</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full transition-all duration-300 ${
                                  isApproved ? 'bg-green-600' : 'bg-yellow-600'
                                }`}
                                style={{ width: `${Math.min((approvedCount / 3) * 100, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                          
                          {/* Approval Details */}
                          <div className="space-y-1 mb-3">
                            {(request.approvals || []).map((approval, approvalIndex) => (
                              <div key={approvalIndex} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">Faculty NIP: {approval.nip}</span>
                                <span className={`font-medium ${approval.approved ? 'text-green-600' : 'text-gray-400'}`}>
                                  {approval.approved ? `✓ Approved (${new Date(approval.approved_at).toLocaleDateString()})` : '⏳ Pending'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* Action Button for Approved Requests */}
                        {isApproved && (
                          <div className="ml-4">
                            <button
                              onClick={() => handleViewDecryptedRecords(request.nim, `Student ${request.nim}`)}
                              className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                            >
                              <FileText className="h-4 w-4" />
                              <span>View Decrypted Records</span>
                            </button>
                            <p className="text-xs text-gray-500 mt-1 text-center">
                              Use Shamir Secret Sharing
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Requests to Approve Section */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Requests Awaiting My Approval</h4>
            {requestsToApprove.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No pending approvals</p>
                <p className="text-sm text-gray-500">Requests from colleagues will appear here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requestsToApprove.map((request, index) => {
                  const approvedCount = (request.approvals || []).filter(a => a.approved).length;
                  
                  return (
                    <div key={index} className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <p className="font-semibold text-gray-900">Student NIM: {request.nim}</p>
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                              Needs Approval
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            Requested by NIP: {request.requester_nip} • {new Date(request.created_at).toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            Current approvals: {approvedCount} / 3
                          </p>
                          {request.viewer_is_advisor && (
                            <p className="text-sm font-medium text-amber-700 mt-1">
                              You are this student's academic advisor — the request
                              cannot be granted without your approval.
                            </p>
                          )}
                          {!request.viewer_is_advisor && !request.advisor_approved && (
                            <p className="text-xs text-gray-500 mt-1">
                              Awaiting the student's own advisor, whose approval is
                              also required.
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApproveRequest(request.nim, request.requester_nip, true)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleApproveRequest(request.nim, request.requester_nip, false)}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Already Approved Section */}
          {myApprovedRequests2.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Requests I've Approved</h4>
              <div className="space-y-3">
                {myApprovedRequests2.map((request, index) => {
                  const approvedCount = (request.approvals || []).filter(a => a.approved).length;
                  const myApproval = (request.approvals || []).find(a => a.nip === userData.nim_nip);
                  
                  return (
                    <div key={index} className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <p className="font-semibold text-gray-900">Student NIM: {request.nim}</p>
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                              ✓ Approved by me
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            Requested by NIP: {request.requester_nip}
                          </p>
                          <p className="text-sm text-gray-500">
                            I approved on: {new Date(myApproval.approved_at).toLocaleString()} • 
                            Total approvals: {approvedCount} / 3
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'security':
        return renderSecurity();
      case 'grades':
        return renderStudentGrades();
      case 'academic':
        return renderAcademicData();
      case 'courses':
        return renderCourseManagement();
      case 'view-student':
        return renderViewStudentRecords();
      case 'group-requests':
        return renderGroupBasedDecryption();
      default:
        return renderOverview();
    }
  };

  if (!userData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Shield className="h-8 w-8 text-primary-600" />
              <div>
                <h1 className="text-xl font-bold gradient-text">Sixvault</h1>
                <p className="text-xs text-gray-600">Secure Academic Management</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userData.nama}</p>
                <p className="text-xs text-gray-600">{userData.type} • {userData.nim_nip}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="card p-4">
              <h2 className="font-semibold text-gray-900 mb-4">Navigation</h2>
              <ul className="space-y-2">
                {navigationItems.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        activeTab === item.id
                          ? 'bg-primary-50 text-primary-700 border border-primary-200'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Transcript Generation Modal */}
      {transcriptModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-lg p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Generate Academic Transcript</h3>
                             <button
                 onClick={handleCloseTranscriptModal}
                 disabled={isGeneratingTranscript || isLoadingTranscriptData}
                 className="text-gray-500 hover:text-gray-700"
               >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Loading Student Data */}
            {isLoadingTranscriptData && (
              <div className="bg-yellow-50 p-3 rounded-lg mb-4 border border-yellow-200">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                  <p className="text-sm text-yellow-800">Loading student information...</p>
                </div>
              </div>
            )}

            {/* Student Info */}
            {!isLoadingTranscriptData && (
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="text-sm"><span className="font-medium">Student:</span> {transcriptStudentName || 'Loading...'}</p>
                <p className="text-sm"><span className="font-medium">NIM:</span> {transcriptNim || 'Loading...'}</p>
                <p className="text-sm"><span className="font-medium">Records:</span> {transcriptStudentData?.length || 0} courses</p>
              </div>
            )}

            {/* Encryption Options */}
            <div className="space-y-4 mb-6">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="encryptTranscript"
                  checked={transcriptEncrypted}
                  onChange={(e) => setTranscriptEncrypted(e.target.checked)}
                  disabled={isGeneratingTranscript}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="encryptTranscript" className="text-sm font-medium text-gray-700">
                  Encrypt PDF with password
                </label>
              </div>

              {transcriptEncrypted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="ml-6"
                >
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Encryption Password *
                  </label>
                  <input
                    type="password"
                    value={transcriptPassword}
                    onChange={(e) => setTranscriptPassword(e.target.value)}
                    disabled={isGeneratingTranscript}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Enter password for encryption"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This password will be required to view the PDF
                  </p>
                </motion.div>
              )}
            </div>

            {/* Loading Kaprodi Data */}
            {isLoadingKaprodi && (
              <div className="bg-yellow-50 p-3 rounded-lg mb-4 border border-yellow-200">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
                  <p className="text-sm text-yellow-800">Loading program head information...</p>
                </div>
              </div>
            )}

            {/* Generated URL */}
            {generatedTranscriptUrl && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-50 p-4 rounded-lg mb-4 border border-green-200"
              >
                <div className="flex items-start space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-green-800 font-medium">Transcript Generated Successfully!</p>
                    <p className="text-sm text-green-600 mb-3">
                      {transcriptEncrypted
                        ? 'Your encrypted transcript is ready. The stored file is RC4 ciphertext, so it must be decrypted with your password before it can be viewed.'
                        : 'Your transcript is ready for download.'}
                    </p>

                    {/* Encrypted transcripts need the password to be opened. */}
                    {transcriptEncrypted && (
                      <div className="mb-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Password used to encrypt this transcript
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="password"
                            value={openEncryptedPassword}
                            onChange={(e) => setOpenEncryptedPassword(e.target.value)}
                            autoComplete="off"
                            className="input-field flex-1"
                            placeholder="Enter password to open"
                            disabled={isOpeningEncrypted}
                          />
                          <button
                            onClick={handleOpenEncryptedTranscript}
                            disabled={isOpeningEncrypted}
                            className="flex items-center space-x-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm disabled:opacity-50"
                          >
                            <Unlock className="h-4 w-4" />
                            <span>{isOpeningEncrypted ? 'Decrypting…' : 'Decrypt & Open'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2">
                      {!transcriptEncrypted && (
                        <button
                          onClick={() => window.open(generatedTranscriptUrl, '_blank')}
                          className="flex items-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          <FileText className="h-4 w-4" />
                          <span>Open PDF</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedTranscriptUrl);
                          toast.success('URL copied to clipboard!');
                        }}
                        className="flex items-center space-x-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy URL</span>
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
                             <button
                 onClick={handleGenerateTranscript}
                 disabled={isGeneratingTranscript || isLoadingKaprodi || isLoadingTranscriptData || (transcriptEncrypted && !transcriptPassword.trim())}
                 className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
               >
                {isGeneratingTranscript ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span>Generate PDF</span>
                  </>
                )}
              </button>
              
                             <button
                 onClick={handleCloseTranscriptModal}
                 disabled={isGeneratingTranscript || isLoadingTranscriptData}
                 className="px-4 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
               >
                 Close
               </button>
            </div>

                         {/* Security Info */}
             <div className="mt-4 bg-purple-50 p-3 rounded-lg border border-purple-200">
               <div className="flex items-start space-x-2">
                 <Shield className="h-4 w-4 text-purple-600 mt-0.5" />
                 <div className="text-xs text-purple-800">
                   <p className="font-medium">Security Features:</p>
                   <ul className="list-disc list-inside mt-1 space-y-1">
                     <li>SHA3 digital signature from program head included in PDF</li>
                     <li>Tamper-proof LaTeX-generated PDF</li>
                     {transcriptEncrypted && <li>RC4 encryption with your custom password</li>}
                     <li>Official academic data with calculated GPA</li>
                     <li>Cryptographic verification of data integrity</li>
                   </ul>
                 </div>
               </div>
             </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 