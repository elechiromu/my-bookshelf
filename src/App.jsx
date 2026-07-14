import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Book, Plus, Search, Star, X, ChevronLeft, ChevronRight, BookOpen, Library, BarChart3, Edit3, Trash2, LogIn, LogOut, User, Loader } from 'lucide-react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';

// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyBI76XW3f11_mbGTsjEDd9guE6LaFvvAfc",
  authDomain: "my-bookshelf-fc438.firebaseapp.com",
  projectId: "my-bookshelf-fc438",
  storageBucket: "my-bookshelf-fc438.firebasestorage.app",
  messagingSenderId: "373826584634",
  appId: "1:373826584634:web:16c5961e24de9dcdc03503"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
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

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Firestoreからデータを取得（リアルタイム同期）
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

  // Googleでログイン
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('ログインエラー:', error);
      alert('ログインに失敗しました');
    }
  };

  // ログアウト
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  // ISBN-10をISBN-13に変換
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

  // 本を検索
  const searchBook = async (isbnCode) => {
    const cleanIsbn = isbnCode.replace(/[-\s]/g, '');
    if (!/^\d{10}$|^\d{13}$/.test(cleanIsbn)) {
      alert('有効なISBNを入力してください（10桁または13桁）');
      return;
    }

    setIsSearching(true);
    try {
      const isbn13 = cleanIsbn.length === 10 ? convertIsbn10to13(cleanIsbn) : cleanIsbn;
      
      const response = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn13}`);
      const data = await response.json();
      
      let title = '';
      let author = '';
      let publisher = '';
      let pubdate = '';

      if (data && data[0]) {
        const bookData = data[0].summary;
        title = bookData.title || '';
        author = bookData.author || '';
        publisher = bookData.publisher || '';
        pubdate = bookData.pubdate || '';
      }

      const cover = `https://ndlsearch.ndl.go.jp/thumbnail/${isbn13}.jpg`;

      if (title) {
        setSearchResult({ isbn: isbn13, title, author, publisher, cover, pubdate });
      } else {
        const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`);
        const googleData = await googleResponse.json();
        
        if (googleData.items && googleData.items[0]) {
          const volumeInfo = googleData.items[0].volumeInfo;
          setSearchResult({
            isbn: isbn13,
            title: volumeInfo.title || '',
            author: volumeInfo.authors?.join(', ') || '',
            publisher: volumeInfo.publisher || '',
            cover: cover,
            pubdate: volumeInfo.publishedDate || ''
          });
        } else {
          alert('本が見つかりませんでした。手動で入力してください。');
          setSearchResult({ isbn: isbn13, title: '', author: '', publisher: '', cover: cover, pubdate: '' });
        }
      }
    } catch (error) {
      console.error('検索エラー:', error);
      alert('検索中にエラーが発生しました');
    }
    setIsSearching(false);
  };

  // 本を追加
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

  // 本を更新
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

  // 本を削除
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

  // 統計データ
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

  const filteredBooks = filterStatus === 'all' ? books : books.filter(b => b.status === filterStatus);

  const getBarColor = (count) => {
    if (count === 0) return '#e5e7eb';
    const maxCount = Math.max(...getMonthlyStats(statsYear).map(d => d.count));
    if (count >= maxCount * 0.8) return '#38bdf8';
    if (count >= maxCount * 0.4) return '#34d399';
    return '#a3e635';
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #faf7f5 0%, #f5f0eb 100%)' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#1e3a5f' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', padding: '20px' }}>
        <div style={{ background: 'white', borderRadius: '24px', padding: '48px 40px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxWidth: '400px', width: '100%' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '20px', background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Library size={40} color="white" />
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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #faf7f5 0%, #f5f0eb 100%)', fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif" }}>
      {/* ヘッダー */}
      <header style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', padding: '20px 24px', color: 'white', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Library size={32} strokeWidth={1.5} />
              <h1 style={{ fontSize: '24px', fontWeight: '600', letterSpacing: '0.5px' }}>My Bookshelf</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user.photoURL && <img src={user.photoURL} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />}
              <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', fontSize: '12px' }}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <nav style={{ display: 'flex', gap: '8px' }}>
            {[{ id: 'shelf', icon: Book, label: '本棚' }, { id: 'stats', icon: BarChart3, label: '統計' }, { id: 'add', icon: Plus, label: '追加' }].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setCurrentView(id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', borderRadius: '8px', border: 'none', background: currentView === id ? 'rgba(255,255,255,0.2)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                <Icon size={18} />{label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* 本棚ビュー */}
        {currentView === 'shelf' && (
          <div>
            {/* 読書中 */}
            {books.filter(b => b.status === STATUS.READING).length > 0 && (
              <div style={{ marginBottom: '32px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderRadius: '16px', padding: '20px', border: '2px solid #bfdbfe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <BookOpen size={20} style={{ color: '#2563eb' }} />
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#1e40af' }}>現在読書中</h2>
                  <span style={{ background: '#3b82f6', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{books.filter(b => b.status === STATUS.READING).length}冊</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {books.filter(b => b.status === STATUS.READING).map(book => (
                    <div key={book.id} onClick={() => { setSelectedBook(book); setIsModalOpen(true); }} style={{ flexShrink: 0, width: '100px', cursor: 'pointer' }}>
                      <div style={{ aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)', background: book.cover ? 'white' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' }}>
                        {book.cover ? <img src={book.cover} alt={book.title} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', textAlign: 'center' }}><span style={{ color: 'white', fontSize: '10px', fontWeight: '500' }}>{book.title}</span></div>}
                      </div>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#1e40af', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 積読 */}
            {books.filter(b => b.status === STATUS.TSUNDOKU).length > 0 && (
              <div style={{ marginBottom: '32px', background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', borderRadius: '16px', padding: '20px', border: '2px solid #ddd6fe' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Library size={20} style={{ color: '#7c3aed' }} />
                  <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#5b21b6' }}>積読</h2>
                  <span style={{ background: '#8b5cf6', color: 'white', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>{books.filter(b => b.status === STATUS.TSUNDOKU).length}冊</span>
                </div>
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '8px' }}>
                  {books.filter(b => b.status === STATUS.TSUNDOKU).map(book => (
                    <div key={book.id} onClick={() => { setSelectedBook(book); setIsModalOpen(true); }} style={{ flexShrink: 0, width: '100px', cursor: 'pointer' }}>
                      <div style={{ aspectRatio: '2/3', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)', background: book.cover ? 'white' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
                        {book.cover ? <img src={book.cover} alt={book.title} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', textAlign: 'center' }}><span style={{ color: 'white', fontSize: '10px', fontWeight: '500' }}>{book.title}</span></div>}
                      </div>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: '#5b21b6', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* フィルター */}
            <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[{ id: 'all', label: 'すべて' }, { id: STATUS.READING, label: '読書中' }, { id: STATUS.COMPLETED, label: '読了' }, { id: STATUS.TSUNDOKU, label: '積読' }, { id: STATUS.WANT_TO_READ, label: '読みたい' }].map(({ id, label }) => (
                <button key={id} onClick={() => setFilterStatus(id)} style={{ padding: '8px 16px', borderRadius: '20px', border: '2px solid', borderColor: filterStatus === id ? '#1e3a5f' : '#d1d5db', background: filterStatus === id ? '#1e3a5f' : 'white', color: filterStatus === id ? 'white' : '#4b5563', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>{label}</button>
              ))}
            </div>

            {/* 本棚グリッド */}
            {filteredBooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <BookOpen size={64} strokeWidth={1} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <p style={{ fontSize: '16px' }}>まだ本が登録されていません</p>
                <button onClick={() => setCurrentView('add')} style={{ marginTop: '16px', padding: '12px 24px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>本を追加する</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '20px' }}>
                {filteredBooks.map(book => (
                  <div key={book.id} onClick={() => { setSelectedBook(book); setIsModalOpen(true); }} style={{ cursor: 'pointer' }}>
                    <div style={{ aspectRatio: '2/3', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', background: book.cover ? 'white' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', position: 'relative' }}>
                      {book.cover ? <img src={book.cover} alt={book.title} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', textAlign: 'center' }}><span style={{ color: 'white', fontSize: '12px', fontWeight: '500', lineHeight: '1.4' }}>{book.title}</span></div>}
                      <div style={{ position: 'absolute', top: '8px', right: '8px', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '600', background: STATUS_COLORS[book.status]?.bg || '#6b7280', color: 'white' }}>{STATUS_LABELS[book.status]}</div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#1f2937', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{book.title}</p>
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 統計ビュー */}
        {currentView === 'stats' && (
          <div>
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

            {/* 月別読了本一覧 */}
            <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginTop: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>{statsYear}年の読了本</h2>
              {(() => {
                const completedBooks = books.filter(book => {
                  if (!book.endDate || book.status !== STATUS.COMPLETED) return false;
                  const endDate = new Date(book.endDate);
                  return endDate.getFullYear() === statsYear;
                });
                if (completedBooks.length === 0) return <p style={{ color: '#9ca3af', textAlign: 'center', padding: '20px' }}>この年に読了した本はありません</p>;
                const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
                const booksByMonth = {};
                completedBooks.forEach(book => {
                  const month = new Date(book.endDate).getMonth();
                  if (!booksByMonth[month]) booksByMonth[month] = [];
                  booksByMonth[month].push(book);
                });
                const sortedMonths = Object.keys(booksByMonth).map(Number).sort((a, b) => b - a);
                return sortedMonths.map(month => (
                  <div key={month} style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span style={{ background: '#3b82f6', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>{monthNames[month]}</span>
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>{booksByMonth[month].length}冊</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {booksByMonth[month].sort((a, b) => new Date(b.endDate) - new Date(a.endDate)).map(book => (
                        <div key={book.id} onClick={() => { setSelectedBook(book); setIsModalOpen(true); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px', cursor: 'pointer' }}>
                          <div style={{ width: '40px', height: '60px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: book.cover ? '#fff' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                            {book.cover ? <img src={book.cover} referrerPolicy="no-referrer" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Book size={16} color="white" /></div>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</p>
                            <p style={{ fontSize: '12px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.author}</p>
                          </div>
                          {book.rating > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}><Star size={14} fill="#fbbf24" stroke="#fbbf24" /><span style={{ fontSize: '12px', color: '#6b7280' }}>{book.rating}</span></div>}
                          <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{new Date(book.endDate).getDate()}日</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* 追加ビュー */}
        {currentView === 'add' && (
          <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', marginBottom: '20px' }}>本を追加</h2>
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
        )}
      </main>

      {/* 本詳細モーダル */}
      {isModalOpen && selectedBook && <BookDetailModal book={selectedBook} isEditMode={isEditMode} onClose={() => { setIsModalOpen(false); setSelectedBook(null); setIsEditMode(false); }} onEdit={() => setIsEditMode(true)} onSave={updateBook} onDelete={deleteBook} />}
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
          <div style={{ aspectRatio: '2/3', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', background: editedResult.cover ? 'white' : '#e5e7eb' }}>
            {editedResult.cover ? <img src={editedResult.cover} referrerPolicy="no-referrer" alt="表紙" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}><Book size={32} /></div>}
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
function BookDetailModal({ book, isEditMode, onClose, onEdit, onSave, onDelete }) {
  const [editedBook, setEditedBook] = useState(book);

  const handleStatusChange = (status) => {
    const updated = { ...editedBook, status };
    if (status === STATUS.READING && !editedBook.startDate) updated.startDate = new Date().toISOString().split('T')[0];
    if (status === STATUS.COMPLETED && !editedBook.endDate) updated.endDate = new Date().toISOString().split('T')[0];
    setEditedBook(updated);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000 }}>
      <div style={{ background: 'white', borderRadius: '16px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', zIndex: 10 }}><X size={24} /></button>
        <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '120px', aspectRatio: '2/3', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 8px 25px rgba(0,0,0,0.3)', background: 'white' }}>
            {editedBook.cover ? <img src={editedBook.cover} referrerPolicy="no-referrer" alt={editedBook.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: '12px', textAlign: 'center', fontSize: '11px' }}>{editedBook.title}</div>}
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
                <button onClick={() => onSave(editedBook)} style={{ flex: 1, padding: '12px 24px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>更新</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
