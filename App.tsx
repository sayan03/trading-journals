import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { collection, addDoc, updateDoc, onSnapshot, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './services/firebase';
import { APP_ID, INITIAL_STRATEGIES, TRADING_QUOTES } from './constants';
import { Trade, TradeFormData, UserProfile } from './types';
import { analyzeTradeHistory } from './services/geminiService';

// Icons
import { 
  LayoutDashboard, Cloud, WifiOff, Filter, X, Sun, Moon, PanelLeftClose, Plus, 
  FileSpreadsheet, Sparkles, LogOut, Loader2, Activity, Mail, Lock, User,
  IndianRupee, Percent, Wallet, TrendingUp, BarChart3, Clock, Pencil, Trash2, Quote,
  Heart, Code2, Calculator, LineChart
} from 'lucide-react';

// Components
import { Charts } from './components/Charts';
import { TradeForm } from './components/TradeForm';
import { CoachModal, AiModal, ProfileModal, RiskCalculatorModal } from './components/Modals';

export default function App() {
  // --- Auth & User State ---
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // --- Data State ---
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<string[]>(INITIAL_STRATEGIES);
  const [syncStatus, setSyncStatus] = useState('offline');
  const [profileCapital, setProfileCapital] = useState(100000);

  // --- UI State ---
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isTradeFormVisible, setIsTradeFormVisible] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [filterStrategy, setFilterStrategy] = useState('');
  const [quoteIndex, setQuoteIndex] = useState(0);

  // --- Modals State ---
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const [coachContent, setCoachContent] = useState('');
  const [coachStrategy, setCoachStrategy] = useState('');

  // --- Form State ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TradeFormData>({
    symbol: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    type: 'LONG',
    entry: '',
    exit: '',
    qty: '',
    strategy: '',
    notes: ''
  });

  // --- Effects ---

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser({
          uid: currentUser.uid,
          displayName: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL
        });
        setIsDemoMode(false);
        setSyncStatus('syncing');
        // Fetch Settings
        try {
          const docSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'settings', 'general'));
          if (docSnap.exists() && docSnap.data().capital) setProfileCapital(docSnap.data().capital);
        } catch (e) { console.error(e); }
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Trades Listener
  useEffect(() => {
    if (!user && !isDemoMode) { setTrades([]); return; }
    
    if (isDemoMode) {
      const stored = localStorage.getItem('demo_trades');
      setTrades(stored ? JSON.parse(stored) : []);
      const storedCap = localStorage.getItem('demo_capital');
      if (storedCap) setProfileCapital(Number(storedCap));
      setSyncStatus('local');
      return;
    }

    if (user) {
      const q = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'trades');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trade));
        loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setTrades(loaded);
        setSyncStatus('saved');
      });
      return () => unsubscribe();
    }
  }, [user, isDemoMode]);

  // Quote Timer
  useEffect(() => {
    const i = setInterval(() => setQuoteIndex(p => (p + 1) % TRADING_QUOTES.length), 10000);
    return () => clearInterval(i);
  }, []);

  // --- Derived Data ---

  const filteredTrades = useMemo(() => {
    let data = trades;
    if (filterDate) {
      const [y, m, d] = filterDate.split('-');
      data = data.filter(t => t.date === `${d}/${m}/${y}`);
    }
    if (filterStrategy) data = data.filter(t => t.strategy === filterStrategy);
    return data;
  }, [trades, filterDate, filterStrategy]);

  const stats = useMemo(() => {
    const totalPnL = filteredTrades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const winningTrades = filteredTrades.filter(t => t.pnl > 0).length;
    const losingTrades = filteredTrades.filter(t => t.pnl <= 0).length;
    const totalTrades = filteredTrades.length;
    const winRate = totalTrades === 0 ? 0 : (winningTrades / totalTrades) * 100;
    const avgWin = filteredTrades.filter(t => t.pnl > 0).reduce((acc, t) => acc + t.pnl, 0) / (winningTrades || 1);
    const roi = profileCapital > 0 ? (totalPnL / profileCapital) * 100 : 0;
    
    return { 
      totalTrades, totalPnL, winRate, avgWin, avgLoss: 0, 
      currentCapital: profileCapital + totalPnL, roi, winningTrades, losingTrades 
    };
  }, [filteredTrades, profileCapital]);

  // --- Handlers ---

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAuth(true);
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: authName });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) { setAuthError(err.message); setLoadingAuth(false); }
  };

  const handleLogout = async () => {
    if (!isDemoMode) await signOut(auth);
    else { setIsDemoMode(false); setUser(null); }
  };

  const handleSaveTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const pnl = (formData.type === 'LONG' ? Number(formData.exit) - Number(formData.entry) : Number(formData.entry) - Number(formData.exit)) * Number(formData.qty);
    const [y, m, d] = formData.date.split('-');
    
    const tradeData = {
      ...formData,
      pnl,
      date: `${d}/${m}/${y}`,
      timestamp: new Date(`${formData.date}T${formData.time || '12:00'}`).getTime()
    };

    if (isDemoMode) {
      let updated = editingId ? trades.map(t => t.id === editingId ? { ...tradeData, id: t.id } : t) : [...trades, { ...tradeData, id: Date.now().toString() }];
      // @ts-ignore
      updated.sort((a,b) => b.timestamp - a.timestamp);
      setTrades(updated as Trade[]);
      localStorage.setItem('demo_trades', JSON.stringify(updated));
    } else if (user) {
       if (editingId) await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'trades', editingId), tradeData);
       else await addDoc(collection(db, 'artifacts', APP_ID, 'users', user.uid, 'trades'), tradeData);
    }
    
    setEditingId(null);
    setFormData({ ...formData, symbol: '', entry: '', exit: '', qty: '', notes: '' });
  };

  const handleDeleteTrade = async (id: string) => {
    if (isDemoMode) {
      const updated = trades.filter(t => t.id !== id);
      setTrades(updated);
      localStorage.setItem('demo_trades', JSON.stringify(updated));
    } else if (user) {
      await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'trades', id));
    }
  };

  const handleEditTrade = (t: Trade) => {
    const [d, m, y] = t.date.split('/');
    setFormData({
      symbol: t.symbol, date: `${y}-${m}-${d}`, time: t.time, type: t.type,
      entry: t.entry, exit: t.exit, qty: t.qty, strategy: t.strategy, notes: t.notes
    });
    setEditingId(t.id);
    setIsTradeFormVisible(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const runAnalysis = async () => {
    if (filteredTrades.length === 0) return;
    setAiLoading(true);
    setIsAiModalOpen(true);
    const result = await analyzeTradeHistory(filteredTrades, stats.totalPnL, stats.winRate, filterDate || "All Time");
    setAiResponse(result);
    setAiLoading(false);
  };

  const handleDownloadCSV = () => {
    if (filteredTrades.length === 0) {
      alert("No trades to download.");
      return;
    }

    const headers = ["Date", "Time", "Symbol", "Type", "Qty", "Entry", "Exit", "P&L", "Strategy", "Notes"];
    
    const rows = filteredTrades.map(t => [
      t.date,
      t.time,
      t.symbol,
      t.type,
      t.qty,
      t.entry,
      t.exit,
      t.pnl,
      t.strategy,
      `"${(t.notes || '').replace(/"/g, '""')}"` 
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trading_journal_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateProfile = async (name: string, photo: string, capital: number, file?: File | null) => {
    if (isDemoMode) {
      // In Demo mode, we need to convert file to base64 to 'simulate' a URL that persists for the session/localStorage
      let finalPhoto = photo;
      if (file) {
         finalPhoto = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
         });
      }

      setUser(prev => prev ? ({ ...prev, displayName: name, photoURL: finalPhoto }) : null);
      setProfileCapital(capital);
      localStorage.setItem('demo_capital', String(capital));
    } else if (user && auth.currentUser) {
      let photoURL = photo;
      
      if (file) {
          const storageRef = ref(storage, `profile_pictures/${user.uid}`);
          await uploadBytes(storageRef, file);
          photoURL = await getDownloadURL(storageRef);
      }
      
      await updateProfile(auth.currentUser, { displayName: name, photoURL });
      await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'settings', 'general'), { capital }, { merge: true });
      setUser(prev => prev ? ({ ...prev, displayName: name, photoURL, capital }) : null);
      setProfileCapital(capital);
    }
  };

  // --- Render ---

  if (loadingAuth) return <div className="flex h-screen items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600 w-8 h-8"/></div>;

  if (!user && !isDemoMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-indigo-600 p-6 text-center">
            <Activity className="w-12 h-12 text-white mx-auto mb-2" />
            <h1 className="text-xl font-bold text-white">Indian Market Journal</h1>
            <p className="text-indigo-200 text-sm">Track Nifty, BankNifty & Stocks</p>
          </div>
          <div className="p-8">
            <form onSubmit={handleAuth} className="space-y-4">
              {isSignUp && <div className="relative"><User className="absolute left-3 top-3 w-5 h-5 text-slate-400"/><input type="text" placeholder="Name" required className="w-full pl-10 p-3 border rounded-lg" value={authName} onChange={e=>setAuthName(e.target.value)}/></div>}
              <div className="relative"><Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400"/><input type="email" placeholder="Email" required className="w-full pl-10 p-3 border rounded-lg" value={email} onChange={e=>setEmail(e.target.value)}/></div>
              <div className="relative"><Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400"/><input type="password" placeholder="Password" required className="w-full pl-10 p-3 border rounded-lg" value={password} onChange={e=>setPassword(e.target.value)}/></div>
              {authError && <p className="text-red-500 text-xs">{authError}</p>}
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg">{isSignUp ? 'Create Account' : 'Login'}</button>
            </form>
            <div className="mt-6 text-center space-y-3">
              <button onClick={()=>setIsSignUp(!isSignUp)} className="text-sm text-indigo-600 hover:underline">{isSignUp ? 'Login instead' : 'New? Sign Up'}</button>
              <div className="text-xs text-slate-400">- OR -</div>
              <button onClick={()=>{setIsDemoMode(true); setUser({uid:'demo', displayName:'Demo Trader', email:'demo@local', photoURL:''})}} className="text-sm text-slate-500 flex items-center justify-center gap-1 mx-auto hover:text-slate-800"><WifiOff size={14}/> Offline Demo Mode</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans pb-20 transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* --- Header --- */}
      <header className={`backdrop-blur-md border-b px-4 py-4 sticky top-0 z-30 shadow-sm transition-all ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className={`text-2xl font-bold flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
              <LayoutDashboard className="text-indigo-600" />
              Trading Journal <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full border border-orange-200">INDIA</span>
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
              <span className={`flex items-center gap-1 ${isDemoMode ? 'text-amber-600' : 'text-emerald-600'}`}>
                {isDemoMode ? <WifiOff size={12}/> : <Cloud size={12}/>} {isDemoMode ? 'Offline' : 'Synced'}
              </span>
              <span>•</span>
              <button onClick={() => setIsProfileOpen(true)} className="flex items-center gap-2 group">
                <div className="w-6 h-6 rounded-full bg-indigo-100 overflow-hidden border border-indigo-200">
                  {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover"/> : <User size={14} className="m-1 text-indigo-600"/>}
                </div>
                <span className="font-medium group-hover:text-indigo-500">{user?.displayName || 'Trader'}</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className={`flex items-center rounded-lg px-2 py-1.5 border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <Filter size={14} className="text-slate-400 mr-2"/>
              <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={`bg-transparent border-none outline-none text-sm w-28 placeholder-slate-400 ${isDarkMode ? 'color-scheme-dark' : ''}`} style={{colorScheme: isDarkMode ? 'dark':'light'}}/>
              {filterDate && <button onClick={() => setFilterDate('')}><X size={14} className="text-slate-400"/></button>}
            </div>

            <div className={`hidden md:flex items-center rounded-lg px-2 py-1.5 border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
              <select value={filterStrategy} onChange={(e) => setFilterStrategy(e.target.value)} className={`bg-transparent border-none outline-none text-sm w-28 cursor-pointer ${isDarkMode ? 'bg-slate-800 text-slate-200' : 'text-slate-700'}`}>
                <option value="">All Strategies</option>
                {strategies.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2 rounded-lg border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-yellow-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Toggle Charts Button */}
            <button 
              onClick={() => setShowCharts(!showCharts)} 
              className={`p-2 rounded-lg border shadow-sm transition-colors ${showCharts ? (isDarkMode ? 'bg-indigo-900/30 border-indigo-700 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-600') : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-white border-slate-200 text-slate-600')}`}
              title={showCharts ? "Hide Charts" : "Show Charts"}
            >
              <LineChart size={16} />
            </button>

            <button onClick={handleDownloadCSV} className={`p-2 rounded-lg border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`} title="Download CSV">
              <FileSpreadsheet size={16} />
            </button>

            <button onClick={() => setIsTradeFormVisible(!isTradeFormVisible)} className={`px-3 py-2 rounded-lg text-sm font-medium border shadow-sm flex gap-2 items-center ${isTradeFormVisible ? (isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-600') : 'bg-emerald-600 text-white border-transparent'}`}>
              {isTradeFormVisible ? <PanelLeftClose size={16}/> : <Plus size={16}/>} <span className="hidden sm:inline">{isTradeFormVisible ? "Hide" : "Log"}</span>
            </button>

            <button onClick={() => setIsCalculatorOpen(true)} className={`px-3 py-2 rounded-lg text-sm font-medium border shadow-sm flex gap-2 items-center text-teal-600 bg-teal-50 border-teal-100 hover:bg-teal-100`}>
               <Calculator size={16}/> <span className="hidden sm:inline">Calc</span>
            </button>

            <button onClick={runAnalysis} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm shadow-indigo-200">
              <Sparkles size={16} /> <span className="hidden sm:inline">AI Analyze</span>
            </button>

            <button onClick={handleLogout} className={`px-3 py-2 rounded-lg border shadow-sm ${isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="max-w-screen-2xl mx-auto p-4 space-y-6">
        
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 xl:gap-6">
          <div className={`p-5 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border hover:shadow-md transition-shadow group relative overflow-hidden ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <div className="flex justify-between items-start mb-2">
               <div className="flex items-center gap-2 text-slate-500 group-hover:text-indigo-600 transition-colors"><IndianRupee size={18}/><span className="text-xs font-bold uppercase tracking-wider">Net P&L</span></div>
               <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stats.roi >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} flex items-center gap-1`}><Percent size={8}/> {stats.roi.toFixed(1)}%</div>
            </div>
            <div className={`text-2xl md:text-3xl font-bold tracking-tight ${stats.totalPnL >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>₹{stats.totalPnL.toLocaleString('en-IN')}</div>
          </div>
          <div className={`p-5 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border hover:shadow-md transition-shadow group relative ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
             <div className="flex items-center gap-2 text-slate-500 mb-2 group-hover:text-purple-600 transition-colors"><Wallet size={18}/><span className="text-xs font-bold uppercase tracking-wider">Capital</span></div>
             <div className={`text-xl md:text-2xl font-bold tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>₹{stats.currentCapital.toLocaleString('en-IN')}</div>
          </div>
          <div className={`p-5 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border hover:shadow-md transition-shadow group hidden md:block ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-2 text-slate-500 mb-2 group-hover:text-blue-600 transition-colors"><Activity size={18}/><span className="text-xs font-bold uppercase tracking-wider">Win Rate</span></div>
            <div className={`text-2xl md:text-3xl font-bold tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>{stats.winRate.toFixed(0)}%</div>
          </div>
          <div className={`p-5 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border hover:shadow-md transition-shadow group hidden md:block ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <div className="flex items-center gap-2 text-slate-500 mb-2 group-hover:text-emerald-600 transition-colors"><TrendingUp size={18}/><span className="text-xs font-bold uppercase tracking-wider">Avg Win</span></div>
            <div className="text-xl font-bold text-emerald-600 tracking-tight">₹{stats.avgWin.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
          </div>
        </div>

        {/* Charts - Conditionally Rendered */}
        {showCharts && (
          <div className="animate-in fade-in slide-in-from-top-4 duration-300">
            <Charts trades={filteredTrades} isDarkMode={isDarkMode} winRate={stats.winRate} winningTrades={stats.winningTrades} losingTrades={stats.losingTrades} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 xl:gap-8">
          {/* Trade Form */}
          {isTradeFormVisible && (
            <div className="lg:col-span-1 animate-in slide-in-from-left-5 duration-300">
              <TradeForm 
                formData={formData} 
                setFormData={setFormData} 
                onSubmit={handleSaveTrade} 
                strategies={strategies} 
                setStrategies={setStrategies}
                isDarkMode={isDarkMode}
                editingId={editingId}
                onCancelEdit={() => { setEditingId(null); setFormData({ ...formData, symbol: '', entry: '', exit: '', qty: '', notes: '' }); }}
                onOpenCoach={(c) => { setCoachContent(c); setCoachStrategy(formData.strategy); setCoachModalOpen(true); }}
              />
            </div>
          )}

          {/* Trade Table */}
          <div className={`${isTradeFormVisible ? 'lg:col-span-2' : 'lg:col-span-3'} transition-all duration-300`}>
             <div className={`rounded-xl shadow-md border overflow-hidden h-full flex flex-col ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className={`p-5 border-b flex justify-between items-center sticky top-0 z-10 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                  <h3 className={`font-bold text-lg flex items-center gap-2 ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                    <BarChart3 className="text-indigo-600" size={20}/> Trade History
                  </h3>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full border ${isDarkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{filteredTrades.length} records</span>
                </div>
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left text-sm">
                    <thead className={`border-b sticky top-0 z-10 ${isDarkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                      <tr>
                        <th className="p-4 font-semibold whitespace-nowrap">Date & Time</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Symbol / Strategy</th>
                        <th className="p-4 font-semibold">Notes</th>
                        <th className="p-4 font-semibold whitespace-nowrap">Side</th>
                        <th className="p-4 font-semibold text-right whitespace-nowrap">P&L</th>
                        <th className="p-4 font-semibold text-center whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                      {filteredTrades.map(t => (
                        <tr key={t.id} className={`group ${isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50/80'}`}>
                          <td className="p-4 whitespace-nowrap">
                            <div className={`font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>{t.date}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-1 font-medium mt-0.5"><Clock size={10}/> {t.time}</div>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <div className={`font-bold text-base ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{t.symbol}</div>
                            <div className={`text-xs inline-block px-1.5 py-0.5 rounded border mt-1 ${isDarkMode ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{t.strategy}</div>
                          </td>
                          <td className="p-4 min-w-[200px] max-w-xl"><div className="text-slate-600 text-xs line-clamp-2 leading-relaxed" title={t.notes}>{t.notes || '-'}</div></td>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${t.type === 'LONG' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>{t.type}</span>
                          </td>
                          <td className={`p-4 text-right font-bold font-mono text-base whitespace-nowrap ${t.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t.pnl >= 0 ? '+' : ''}₹{Math.abs(t.pnl).toLocaleString('en-IN')}</td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditTrade(t)} className="p-2 text-slate-400 hover:text-indigo-600"><Pencil size={16} /></button>
                              <button onClick={() => handleDeleteTrade(t.id)} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        </div>

        {/* Motivation Banner */}
        <div className="mt-8 relative overflow-hidden rounded-2xl shadow-2xl animate-in fade-in duration-700 group ring-1 ring-indigo-900/5">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-purple-800 to-slate-900"></div>
          <div className="relative z-10 flex flex-col items-center justify-center p-10 text-center gap-6">
             <div className="max-w-4xl px-4">
              <Quote className="text-white/20 mx-auto mb-4" size={32}/>
              <p className="text-2xl font-bold text-white italic leading-relaxed drop-shadow-sm min-h-[4rem] flex items-center justify-center">"{TRADING_QUOTES[quoteIndex]}"</p>
            </div>
            <div className="flex gap-2">{TRADING_QUOTES.map((_, i) => <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === quoteIndex ? 'w-8 bg-white' : 'w-2 bg-white/20'}`}/>)}</div>
          </div>
        </div>
      </main>
      
      {/* Footer Credit */}
      <footer className={`mt-12 py-8 border-t transition-colors ${isDarkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-white/50'}`}>
        <div className="max-w-screen-2xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          <div className={`${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            &copy; 2025 TradeJournal AI India. All rights reserved.
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Designed & Developed by</span>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-slate-800 border border-indigo-100 dark:border-slate-700">
              <Code2 size={12} className="text-indigo-500"/>
              <span className={`font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 bg-clip-text text-transparent`}>
                Sayan Saha
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CoachModal isOpen={coachModalOpen} onClose={() => setCoachModalOpen(false)} content={coachContent} strategyName={coachStrategy} isDarkMode={isDarkMode} />
      <AiModal isOpen={isAiModalOpen} onClose={() => setIsAiModalOpen(false)} content={aiResponse} loading={aiLoading} isDarkMode={isDarkMode} />
      {/* Change here: Passing stats.currentCapital instead of profileCapital */}
      <RiskCalculatorModal isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} userCapital={stats.currentCapital} isDarkMode={isDarkMode} />
      {user && <ProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} user={user} currentCapital={profileCapital} isDarkMode={isDarkMode} onUpdateProfile={handleUpdateProfile} isDemoMode={isDemoMode} />}
    </div>
  );
}