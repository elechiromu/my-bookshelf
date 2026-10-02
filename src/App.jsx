import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Book, Plus, Search, Star, X, ChevronLeft, ChevronRight, BookOpen, Library, BarChart3, Edit3, Trash2, LogOut, Loader, RefreshCw, Camera } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBI76XW3f11_mbGTsjEDd9guE6LaFvvAfc",
  authDomain: "my-bookshelf-fc438.firebaseapp.com",
  projectId: "my-bookshelf-fc438",
  storageBucket: "my-bookshelf-fc438.firebasestorage.app",
  messagingSenderId: "373826584634",
  appId: "1:373826584634:web:16c5961e24de9dcdc03503"
};

// 楽天API設定
const RAKUTEN_APP_ID = "1009573082361123761";

// Firebase初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// 本のステータス
const STATUS = {
  READING: 'reading',
  COMPLETED: 'completed',
  TSUNDOKU: 'tsundoku',
  WANT_TO_READ: 'want_to_read'
};

const STATUS_LABELS = {
  [STATUS.READING]: '読書中',
  [STATUS.COMPLETED]: '読了',
  [STATUS.TSUNDOKU]: '積読',
  [STATUS.WANT_TO_READ]: '読みたい'
};

const STATUS_COLORS = {
  [STATUS.READING]: { bg: '#3b82f6', light: '#eff6ff', text: '#2563eb' },
  [STATUS.COMPLETED]: { bg: '#10b981', light: '#ecfdf5', text: '#059669' },
  [STATUS.TSUNDOKU]: { bg: '#8b5cf6', light: '#f5f3ff', text: '#7c3aed' },
  [STATUS.WANT_TO_READ]: { bg: '#f59e0b', light: '#fffbeb', text: '#d97706' }
};

// ソートオプション
const SORT_OPTIONS = [
  { id: 'createdAt_desc', label: '登録日（新しい順）' },
  { id: 'createdAt_asc', label: '登録日（古い順）' },
  { id: 'title_asc', label: 'タイトル（あいうえお順）' },
  { id: 'title_desc', label: 'タイトル（逆順）' },
  { id: 'author_asc', label: '著者名順' },
  { id: 'rating_desc', label: '評価が高い順' },
  { id: 'endDate_desc', label: '読了日（新しい順）' },
];

// 1ページあたりの本の数
const BOOKS_PER_PAGE = 12;

// 壊れた画像URLを検出
function isBrokenUrl(url) {
  if (!url) return true;
  if (url.includes('ndlsearch.ndl.go.jp')) return true;
  if (url.includes('iss.ndl.go.jp')) return true;
  return false;
}

// 画像コンポーネント
function BookCover({ src, title, style = {} }) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (isBrokenUrl(src)) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    setHasError(false);
    setIsLoading(true);

    timeoutRef.current = setTimeout(() => {
      setHasError(true);
      setIsLoading(false);
    }, 10000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [src]);

  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setHasError(false);
    setIsLoading(false);
  };

  const handleError = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setHasError(true);
    setIsLoading(false);
  };

  if (!src || hasError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '8px',
        textAlign: 'center',
        ...style
      }}>
        <span style={{ color: 'white', fontSize: '10px', fontWeight: '500', lineHeight: '1.3' }}>{title}</span>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f3f4f6'
        }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
        </div>
      )}
      <img
        src={src}
        alt={title}
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.2s'
        }}
      />
    </>
  );
}

// 楽天APIで画像取得
async function fetchCoverFromRakuten(isbn) {
  try {
    const response = await fetch(
      `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=${RAKUTEN_APP_ID}&isbn=${isbn}`
    );
    if (!response.ok) return '';
    const data = await response.json();
    if (data.Items && data.Items.length > 0) {
      const book = data.Items[0].Item;
      return book.largeImageUrl || book.mediumImageUrl || '';
    }
    return '';
  } catch (error) {
    console.error('楽天API error:', error);
    return '';
  }
}

// OpenBD APIで画像取得
async function fetchCoverFromOpenBD(isbn) {
  try {
    const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
    const data = await response.json();
    if (data && data[0]?.summary?.cover) {
      return data[0].summary.cover;
    }
    return '';
  } catch (error) {
    return '';
  }
}

// Google Books APIで画像取得
async function fetchCoverFromGoogle(isbn) {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await response.json();
    if (data.items && data.items[0]?.volumeInfo?.imageLinks) {
      const thumbnail = data.items[0].volumeInfo.imageLinks.thumbnail || '';
      return thumbnail.replace('http://', 'https://').replace('zoom=1', 'zoom=2');
    }
    return '';
  } catch (error) {
    return '';
  }
}

// ソート関数
function sortBooks(books, sortKey) {
  const [field, direction] = sortKey.split('_');
  const sorted = [...books].sort((a, b) => {
    let aVal = a[field] || '';
    let bVal = b[field] || '';

    // 日本語対応のソート
    if (field === 'title' || field === 'author') {
      return direction === 'asc'
        ? aVal.localeCompare(bVal, 'ja')
        : bVal.localeCompare(aVal, 'ja');
    }

    // 数値・日付ソート
    if (field === 'rating') {
      aVal = a.rating || 0;
      bVal = b.rating || 0;
    }

    if (direction === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
  return sorted;
}

export default function BookshelfApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [currentView, setCurrentView] = useState('shelf');
  const [selectedBook, setSelectedBook] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isbn, setIsbn] = useState('');
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortKey, setSortKey] = useState('createdAt_desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setBooks([]);
      return;
    }

    const booksRef = collection(db, 'users', user.uid, 'books');
    const q = query(booksRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const booksData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBooks(booksData);
    }, (error) => {
      console.error('Firestore error:', error);
    });

    return () => unsubscribe();
  }, [user]);

  // フィルター・ソート・ページネーション適用
  const processedBooks = useMemo(() => {
    let result = filterStatus === 'all' ? books : books.filter(b => b.status === filterStatus);
    result = sortBooks(result, sortKey);
    return result;
  }, [books, filterStatus, sortKey]);

  const totalPages = Math.ceil(processedBooks.length / BOOKS_PER_PAGE);
  const paginatedBooks = processedBooks.slice(
    (currentPage - 1) * BOOKS_PER_PAGE,
    currentPage * BOOKS_PER_PAGE
  );

  // フィルターやソートが変わったらページをリセット
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStatus, sortKey]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('ログインエラー:', error);
      alert('ログインに失敗しました');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  const convertIsbn10to13 = (isbn10) => {
    if (isbn10.length !== 10) return isbn10;
    const isbn12 = '978' + isbn10.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(isbn12[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return isbn12 + checkDigit;
  };

  const startScanner = () => {
    setIsScanning(true);
  };

  useEffect(() => {
    if (!isScanning) return;

    const initScanner = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => {
            const cleanCode = decodedText.replace(/[^0-9X]/gi, '');
            if (/^(978|979)?\d{9}[\dX]$/i.test(cleanCode)) {
              stopScanner();
              setIsbn(cleanCode);
              searchBook(cleanCode);
            }
          },
          () => {}
        );
      } catch (err) {
        console.error('Scanner error:', err);
        setIsScanning(false);
        alert('カメラを起動できませんでした');
      }
    };

    initScanner();
  }, [isScanning]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error('Stop scanner error:', err);
      }
    }
    setIsScanning(false);
  };

  const searchBook = async (isbnCode) => {
    const cleanIsbn = isbnCode.replace(/[-\s]/g, '');
    if (!/^\d{10}$|^\d{13}$/.test(cleanIsbn)) {
      alert('有効なISBNを入力してください（10桁または13桁）');
      return;
    }

    setIsSearching(true);
    try {
      const isbn13 = cleanIsbn.length === 10 ? convertIsbn10to13(cleanIsbn) : cleanIsbn;

      let title = '';
      let author = '';
      let publisher = '';
      let cover = '';
      let pubdate = '';

      try {
        const response = await fetch(
          `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?applicationId=${RAKUTEN_APP_ID}&isbn=${isbn13}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.Items && data.Items.length > 0) {
            const book = data.Items[0].Item;
            title = book.title || '';
            author = book.author || '';
            publisher = book.publisherName || '';
            cover = book.largeImageUrl || book.mediumImageUrl || '';
            pubdate = book.salesDate || '';
          }
        }
      } catch (e) {
        console.log('楽天API error:', e);
      }

      if (!title) {
        try {
          const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn13}`);
          const data = await response.json();
          if (data && data[0]) {
            const bookData = data[0].summary;
            title = bookData.title || title;
            author = bookData.author || author;
            publisher = bookData.publisher || publisher;
            if (!cover && bookData.cover) cover = bookData.cover;
            pubdate = bookData.pubdate || pubdate;
          }
        } catch (e) {
          console.log('OpenBD error:', e);
        }
      }

      if (!title) {
        try {
          const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`);
          const data = await response.json();
          if (data.items && data.items[0]) {
            const volumeInfo = data.items[0].volumeInfo;
            title = volumeInfo.title || title;
            author = volumeInfo.authors?.join(', ') || author;
            publisher = volumeInfo.publisher || publisher;
            if (!cover && volumeInfo.imageLinks?.thumbnail) {
              cover = volumeInfo.imageLinks.thumbnail.replace('http://', 'https://');
            }
            pubdate = volumeInfo.publishedDate || pubdate;
          }
        } catch (e) {
          console.log('Google Books error:', e);
        }
      }

      if (title) {
        setSearchResult({ isbn: isbn13, title, author, publisher, cover, pubdate });
      } else {
        alert('本が見つかりませんでした。手動で入力してください。');
        setSearchResult({ isbn: isbn13, title: '', author: '', publisher: '', cover: '', pubdate: '' });
      }
    } catch (error) {
      console.error('検索エラー:', error);
      alert('検索中にエラーが発生しました');
    }
    setIsSearching(false);
  };

  const addBook = async (bookData) => {
    if (!user) return;

    const newBook = {
      ...bookData,
      status: STATUS.TSUNDOKU,
      startDate: '',
      endDate: '',
      rating: 0,
      review: '',
      createdAt: new Date().toISOString()
    };

    try {
      const bookId = Date.now().toString();
      await setDoc(doc(db, 'users', user.uid, 'books', bookId), newBook);
      setSearchResult(null);
      setIsbn('');
      setCurrentView('shelf');
    } catch (error) {
      console.error('保存エラー:', error);
      alert('本の保存に失敗しました');
    }
  };

  const updateBook = async (updatedBook) => {
    if (!user) return;

    try {
      const { id, ...bookData } = updatedBook;
      await setDoc(doc(db, 'users', user.uid, 'books', id), bookData);
      setSelectedBook(null);
      setIsModalOpen(false);
      setIsEditMode(false);
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  const updateBookCover = async (bookId, newCover) => {
    if (!user) return;

    const bookToUpdate = books.find(b => b.id === bookId);
    if (bookToUpdate) {
      const { id, ...bookData } = bookToUpdate;
      await setDoc(doc(db, 'users', user.uid, 'books', id), { ...bookData, cover: newCover });
    }
  };

  const deleteBook = async (id) => {
    if (!user) return;

    if (confirm('この本を削除しますか？')) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'books', id));
        setSelectedBook(null);
        setIsModalOpen(false);
      } catch (error) {
        console.error('削除エラー:', error);
        alert('削除に失敗しました');
      }
    }
  };

  const refetchCover = async (book) => {
    if (!book.isbn) return null;

    let newCover = await fetchCoverFromRakuten(book.isbn);
    if (!newCover) newCover = await fetchCoverFromOpenBD(book.isbn);
    if (!newCover) newCover = await fetchCoverFromGoogle(book.isbn);

    return newCover;
  };

  const uploadCover = async (bookId, file) => {
    if (!user) return null;

    const storageRef = ref(storage, `covers/${user.uid}/${bookId}_${Date.now()}`);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    await updateBookCover(bookId, downloadURL);

    return downloadURL;
  };

  const getMonthlyStats = (year) => {
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    return months.map((month, index) => ({
      month,
      count: books.filter(book => {
        if (!book.endDate || book.status !== STATUS.COMPLETED) return false;
        const endDate = new Date(book.endDate);
        return endDate.getFullYear() === year && endDate.getMonth() === index;
      }).length
    }));
  };

  const getBarColor = (count) => {
    if (count === 0) return '#e5e7eb';
    const maxCount = Math.max(...getMonthlyStats(statsYear).map(d => d.count));
    if (count >= maxCount * 0.8) return '#38bdf8';
    if (count >= maxCount * 0.4) return '#34d399';
    return '#a3e635';
  };

  // 統計サマリー
  const stats = {
    total: books.length,
    reading: books.filter(b => b.status === STATUS.READING).length,
    completed: books.filter(b => b.status === STATUS.COMPLETED).length,
    tsundoku: books.filter(b => b.status === STATUS.TSUNDOKU).length,
    wantToRead: books.filter(b => b.status === STATUS.WANT_TO_READ).length,
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #1a1209 0%, #2d1f1a 100%)' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#d4a574' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #1a1209 0%, #2d1f1a 100%)', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '48px 40px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxWidth: '400px', width: '100%' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #8B4513 0%, #654321 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Library size={40} color="#d4a574" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#1f2937', marginBottom: '8px' }}>My Bookshelf</h1>
          <p style={{ color: '#6b7280', marginBottom: '32px', lineHeight: '1.6' }}>読書記録をクラウドに保存<br />iPhone・Mac間で同期できます</p>
          <button onClick={handleLogin} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', width: '100%', padding: '16px 24px', background: 'white', border: '2px solid #e5e7eb', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '500', color: '#1f2937' }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #1a1209 0%, #2d1f1a 50%, #1a1209 100%)', fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif" }}>
      {/* ヘッダー */}
      <header style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', padding: '16px 20px', color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Library size={28} strokeWidth={1.5} />
              <h1 style={{ fontSize: '20px', fontWeight: '600' }}>My Bookshelf</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user.photoURL && <img src={user.photoURL} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />}
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', padding: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer' }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: '8px' }}>
            {[{ id: 'shelf', icon: Book, label: '本棚' }, { id: 'stats', icon: BarChart3, label: '統計' }, { id: 'add', icon: Plus, label: '追加' }].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setCurrentView(id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: currentView === id ? 'rgba(255,255,255,0.2)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                <Icon size={18} />{label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* 本棚ビュー */}
      {currentView === 'shelf' && (
        <>
          {/* コントロールバー */}
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px' }}>並び順:</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '13px', cursor: 'pointer' }}
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id} style={{ background: '#333', color: 'white' }}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[{ id: 'all', label: 'すべて' }, { id: STATUS.READING, label: '読書中' }, { id: STATUS.COMPLETED, label: '読了' }, { id: STATUS.TSUNDOKU, label: '積読' }, { id: STATUS.WANT_TO_READ, label: '読みたい' }].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setFilterStatus(id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '16px',
                    border: '1px solid',
                    borderColor: filterStatus === id ? 'white' : 'rgba(255,255,255,0.3)',
                    background: filterStatus === id ? 'rgba(255,255,255,0.2)' : 'transparent',
                    color: filterStatus === id ? 'white' : 'rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 統計バー */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 20px', display: 'flex', justifyContent: 'center', gap: '24px', color: 'rgba(255,255,255,0.8)', fontSize: '13px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: '700', color: 'white' }}>{stats.total}</span> 冊
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              読書中 <span style={{ fontWeight: '700', color: '#3b82f6' }}>{stats.reading}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              積読 <span style={{ fontWeight: '700', color: '#8b5cf6' }}>{stats.tsundoku}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              読了 <span style={{ fontWeight: '700', color: '#10b981' }}>{stats.completed}</span>
            </div>
          </div>

          {/* 本棚 */}
          <div style={{ padding: '30px 20px', minHeight: 'calc(100vh - 280px)' }}>
            {paginatedBooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.6)' }}>
                <BookOpen size={64} strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <p style={{ fontSize: '16px' }}>本が登録されていません</p>
                <button onClick={() => setCurrentView('add')} style={{ marginTop: '16px', padding: '12px 24px', background: '#d4a574', color: '#1a1209', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>本を追加する</button>
              </div>
            ) : (
              <Shelf books={paginatedBooks} onBookClick={(book) => { setSelectedBook(book); setIsModalOpen(true); }} />
            )}
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '20px', color: 'white' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '18px',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      border: 'none',
                      background: currentPage === i + 1 ? 'white' : 'rgba(255,255,255,0.3)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
              <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{currentPage} / {totalPages} ページ</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.3)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  fontSize: '18px',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </>
      )}

      {/* 統計ビュー */}
      {currentView === 'stats' && (
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>読み終わった本</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px', marginBottom: '24px' }}>
              <button onClick={() => setStatsYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '8px' }}><ChevronLeft size={24} /></button>
              <span style={{ fontSize: '20px', fontWeight: '600', color: '#3b82f6' }}>{statsYear}年</span>
              <button onClick={() => setStatsYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '8px' }}><ChevronRight size={24} /></button>
            </div>
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getMonthlyStats(statsYear)} margin={{ top: 30, right: 10, left: 10, bottom: 5 }}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="count" position="top" style={{ fontSize: '12px', fill: '#4b5563', fontWeight: '600' }} formatter={(value) => value > 0 ? value : ''} />
                    {getMonthlyStats(statsYear).map((entry, index) => <Cell key={`cell-${index}`} fill={getBarColor(entry.count)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ marginTop: '24px', padding: '16px', background: '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
              <span style={{ color: '#6b7280', fontSize: '14px' }}>年間読了数</span>
              <span style={{ display: 'block', fontSize: '36px', fontWeight: '700', color: '#1e3a5f', marginTop: '4px' }}>{getMonthlyStats(statsYear).reduce((sum, m) => sum + m.count, 0)}<span style={{ fontSize: '16px', fontWeight: '500' }}> 冊</span></span>
            </div>
          </div>
        </main>
      )}

      {/* 追加ビュー */}
      {currentView === 'add' && (
        <main style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>本を追加</h2>

            {isScanning ? (
              <div style={{ marginBottom: '24px' }}>
                <div id="reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}></div>
                <button onClick={stopScanner} style={{ display: 'block', margin: '16px auto 0', padding: '12px 24px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  スキャン停止
                </button>
              </div>
            ) : (
              <button onClick={startScanner} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '16px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '600', marginBottom: '24px' }}>
                <Camera size={24} />
                バーコードをスキャン
              </button>
            )}

            <div style={{ textAlign: 'center', color: '#9ca3af', marginBottom: '16px' }}>または</div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#4b5563', marginBottom: '8px' }}>ISBN（バーコード下の数字）</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={isbn} onChange={e => setIsbn(e.target.value)} placeholder="978-4-XXXX-XXXX-X" style={{ flex: 1, padding: '12px 16px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '16px', outline: 'none' }} onKeyDown={e => e.key === 'Enter' && searchBook(isbn)} />
                <button onClick={() => searchBook(isbn)} disabled={isSearching} style={{ padding: '12px 24px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', cursor: isSearching ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '500' }}>
                  <Search size={18} />{isSearching ? '検索中...' : '検索'}
                </button>
              </div>
            </div>
            {searchResult && <SearchResultCard result={searchResult} onAdd={addBook} onCancel={() => setSearchResult(null)} />}
          </div>
        </main>
      )}

      {/* 本詳細モーダル */}
      {isModalOpen && selectedBook && (
        <BookDetailModal
          book={selectedBook}
          isEditMode={isEditMode}
          onClose={() => { setIsModalOpen(false); setSelectedBook(null); setIsEditMode(false); }}
          onEdit={() => setIsEditMode(true)}
          onSave={updateBook}
          onDelete={deleteBook}
          onRefetchCover={refetchCover}
          onUpdateCover={updateBookCover}
          onUploadCover={uploadCover}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// 木目本棚コンポーネント（レスポンシブ対応）
function Shelf({ books, onBookClick }) {
  const [booksPerRow, setBooksPerRow] = useState(4);

  useEffect(() => {
    const updateBooksPerRow = () => {
      setBooksPerRow(window.innerWidth < 500 ? 4 : window.innerWidth < 800 ? 5 : 6);
    };
    updateBooksPerRow();
    window.addEventListener('resize', updateBooksPerRow);
    return () => window.removeEventListener('resize', updateBooksPerRow);
  }, []);

  // 本を行に分割
  const rows = [];
  for (let i = 0; i < books.length; i += booksPerRow) {
    rows.push(books.slice(i, i + booksPerRow));
  }

  return (
    <div style={{ maxWidth: '100%', padding: '0 10px' }}>
      {rows.map((rowBooks, rowIndex) => (
        <div key={rowIndex} style={{ marginBottom: '15px' }}>
          {/* 本の行 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
            gap: '8px',
            padding: '15px 10px 10px',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            {rowBooks.map(book => (
              <div
                key={book.id}
                onClick={() => onBookClick(book)}
                style={{ cursor: 'pointer' }}
              >
                <div style={{
                  aspectRatio: '2/3',
                  borderRadius: '3px',
                  boxShadow: '3px 3px 8px rgba(0,0,0,0.5), -1px 0 2px rgba(0,0,0,0.3)',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  <BookCover src={book.cover} title={book.title} />
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '8px',
                    fontWeight: '600',
                    color: 'white',
                    background: STATUS_COLORS[book.status]?.bg || '#6b7280'
                  }}>
                    {STATUS_LABELS[book.status]}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 棚板 */}
          <div style={{
            height: '14px',
            background: 'linear-gradient(180deg, #b8860b 0%, #8B4513 20%, #654321 50%, #4a3520 80%, #3d2817 100%)',
            borderRadius: '2px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.1)',
            maxWidth: '620px',
            margin: '0 auto',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '2px',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
              borderRadius: '2px 2px 0 0'
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// 検索結果カード
function SearchResultCard({ result, onAdd, onCancel }) {
  const [editedResult, setEditedResult] = useState(result);
  return (
    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '20px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '16px' }}>検索結果</h3>
      <div style={{ display: 'flex', gap: '20px' }}>
        <div style={{ width: '100px', flexShrink: 0 }}>
          <div style={{ aspectRatio: '2/3', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', position: 'relative' }}>
            <BookCover src={editedResult.cover} title={editedResult.title || 'No Title'} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>タイトル</label>
            <input type="text" value={editedResult.title} onChange={e => setEditedResult({ ...editedResult, title: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', marginTop: '4px' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>著者</label>
            <input type="text" value={editedResult.author} onChange={e => setEditedResult({ ...editedResult, author: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', marginTop: '4px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>出版社</label>
            <input type="text" value={editedResult.publisher} onChange={e => setEditedResult({ ...editedResult, publisher: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', marginTop: '4px' }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '10px 20px', background: 'white', border: '2px solid #d1d5db', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', color: '#4b5563' }}>キャンセル</button>
        <button onClick={() => onAdd(editedResult)} disabled={!editedResult.title} style={{ padding: '10px 24px', background: editedResult.title ? '#10b981' : '#d1d5db', color: 'white', border: 'none', borderRadius: '8px', cursor: editedResult.title ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: '500' }}>本棚に追加</button>
      </div>
    </div>
  );
}

// 本詳細モーダル
function BookDetailModal({ book, isEditMode, onClose, onEdit, onSave, onDelete, onRefetchCover, onUpdateCover, onUploadCover }) {
  const [editedBook, setEditedBook] = useState(book);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleStatusChange = (status) => {
    const updated = { ...editedBook, status };
    if (status === STATUS.READING && !editedBook.startDate) updated.startDate = new Date().toISOString().split('T')[0];
    if (status === STATUS.COMPLETED && !editedBook.endDate) updated.endDate = new Date().toISOString().split('T')[0];
    setEditedBook(updated);
  };

  const handleRefetchCover = async () => {
    if (!editedBook.isbn) {
      alert('ISBNがないため画像を取得できません');
      return;
    }
    setIsRefetching(true);
    try {
      const newCover = await onRefetchCover(editedBook);
      if (newCover) {
        setEditedBook({ ...editedBook, cover: newCover });
        await onUpdateCover(editedBook.id, newCover);
        alert('画像を更新しました！');
      } else {
        alert('画像が見つかりませんでした');
      }
    } catch (error) {
      alert('画像の更新に失敗しました');
    }
    setIsRefetching(false);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    try {
      const newCover = await onUploadCover(editedBook.id, file);
      if (newCover) {
        setEditedBook({ ...editedBook, cover: newCover });
        alert('画像をアップロードしました！');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました');
    }
    setIsUploading(false);
    e.target.value = '';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '16px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', zIndex: 10 }}><X size={24} /></button>
        <div style={{ background: 'linear-gradient(135deg, #654321 0%, #8B4513 100%)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '120px', aspectRatio: '2/3', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 8px 25px rgba(0,0,0,0.5)', position: 'relative' }}>
            <BookCover src={editedBook.cover} title={editedBook.title} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button
              onClick={handleRefetchCover}
              disabled={isRefetching || isUploading}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '6px',
                cursor: isRefetching ? 'wait' : 'pointer',
                fontSize: '11px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RefreshCw size={12} style={isRefetching ? { animation: 'spin 1s linear infinite' } : {}} />
              {isRefetching ? '取得中...' : '再取得'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isRefetching}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '6px',
                cursor: isUploading ? 'wait' : 'pointer',
                fontSize: '11px',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Camera size={12} />
              {isUploading ? 'アップロード中...' : 'アップロード'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              style={{ display: 'none' }}
            />
          </div>
        </div>
        <div style={{ padding: '24px' }}>
          {isEditMode ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>タイトル</label>
                <input type="text" value={editedBook.title} onChange={e => setEditedBook({ ...editedBook, title: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', color: '#6b7280' }}>著者</label>
                <input type="text" value={editedBook.author} onChange={e => setEditedBook({ ...editedBook, author: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px' }} />
              </div>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1f2937', marginBottom: '4px' }}>{editedBook.title}</h2>
              <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '16px' }}>{editedBook.author}{editedBook.publisher && ` / ${editedBook.publisher}`}</p>
            </>
          )}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '8px' }}>読書状態</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => handleStatusChange(key)} style={{ flex: '1 1 calc(50% - 4px)', minWidth: '80px', padding: '10px', borderRadius: '8px', border: '2px solid', borderColor: editedBook.status === key ? STATUS_COLORS[key].bg : '#e5e7eb', background: editedBook.status === key ? STATUS_COLORS[key].light : 'white', color: editedBook.status === key ? STATUS_COLORS[key].text : '#6b7280', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: '#6b7280' }}>読書開始日</label>
              <input type="date" value={editedBook.startDate || ''} onChange={e => setEditedBook({ ...editedBook, startDate: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '12px', color: '#6b7280' }}>読了日</label>
              <input type="date" value={editedBook.endDate || ''} onChange={e => setEditedBook({ ...editedBook, endDate: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px' }} />
            </div>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '8px' }}>評価</label>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button key={star} onClick={() => setEditedBook({ ...editedBook, rating: star })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                  <Star size={28} fill={star <= editedBook.rating ? '#fbbf24' : 'none'} stroke={star <= editedBook.rating ? '#fbbf24' : '#d1d5db'} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: '#6b7280' }}>感想・メモ</label>
            <textarea value={editedBook.review || ''} onChange={e => setEditedBook({ ...editedBook, review: e.target.value })} placeholder="この本の感想を書く..." rows={4} style={{ width: '100%', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', marginTop: '4px', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => onDelete(editedBook.id)} style={{ padding: '12px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer' }}><Trash2 size={18} /></button>
            {isEditMode ? (
              <button onClick={() => onSave(editedBook)} style={{ flex: 1, padding: '12px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>保存</button>
            ) : (
              <>
                <button onClick={onEdit} style={{ flex: 1, padding: '12px 24px', background: '#f3f4f6', color: '#4b5563', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Edit3 size={16} />編集</button>
                <button onClick={() => onSave(editedBook)} style={{ flex: 1, padding: '12px 24px', background: '#654321', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>更新</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
