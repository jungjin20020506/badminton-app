import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction, query, addDoc, where, getDocs
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정
// ===================================================================================

const firebaseConfig = {
  apiKey: "AIzaSyC-eeHazZ3kVj7aQicdtlnhEmLbbTJHgGE",
  authDomain: "noerror-14ce3.firebaseapp.com",
  projectId: "noerror-14ce3",
  storageBucket: "noerror-14ce3.firebasestorage.app",
  messagingSenderId: "279065154821",
  appId: "1:279065154821:web:812570dde2bdde560a936c",
  measurementId: "G-PFGZGHT9T4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리"];
const generateId = (name) => name.replace(/\s+/g, '_');

// ===================================================================================
// 아이콘 컴포넌트
// ===================================================================================
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-yellow-400"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;

// ===================================================================================
// 메인 앱 구조 (페이지 라우터 역할)
// ===================================================================================
export default function App() {
    const [page, setPage] = useState('lobby'); // lobby, auth, profile, room
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentRoomId, setCurrentRoomId] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
                const userDocRef = doc(db, 'users', firebaseUser.uid);
                const unsubDoc = onSnapshot(userDocRef, (doc) => {
                    if (doc.exists()) setUserData(doc.data());
                    else setUserData(null); 
                });
            } else {
                setUser(null);
                setUserData(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const goToPage = (pageName, roomId = null) => {
        if ((pageName === 'room' || pageName === 'profile') && !user) {
            setPage('auth');
        } else {
            setPage(pageName);
            if (roomId) setCurrentRoomId(roomId);
        }
    };
    
    if (loading) return <div className="bg-black text-white min-h-screen flex items-center justify-center">로딩 중...</div>;

    const renderPage = () => {
        switch (page) {
            case 'auth': return <AuthPage goToPage={goToPage} />;
            case 'profile': return <ProfilePage userData={userData} goToPage={goToPage} />;
            case 'room': return <GameRoomPage user={user} userData={userData} goToPage={goToPage} roomId={currentRoomId} />;
            case 'lobby': default: return <LobbyPage goToPage={goToPage} />;
        }
    };

    return <div className="bg-black text-white min-h-screen font-sans">{renderPage()}</div>;
}

// ===================================================================================
// 1. 인증/프로필 페이지들
// ===================================================================================
function AuthPage({ goToPage }) {
    const [isSignUp, setIsSignUp] = useState(false);
    // 로그인
    const [loginId, setLoginId] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    // 회원가입
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    // 상태
    const [step, setStep] = useState('details'); // details, code
    const [confirmationResult, setConfirmationResult] = useState(null);
    const [isUsernameAvailable, setIsUsernameAvailable] = useState(null);
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [timer, setTimer] = useState(180);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (step !== 'code' || timer <= 0) return;
        const interval = setInterval(() => setTimer(t => t - 1), 1000);
        return () => clearInterval(interval);
    }, [step, timer]);

    const setupRecaptcha = () => {
        if (!window.recaptchaVerifier) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
            });
        }
        return window.recaptchaVerifier;
    };

    const checkUsernameAvailability = async () => {
        if (!username) { setError("아이디를 입력해주세요."); return; }
        setLoading(true);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            setIsUsernameAvailable(true);
            setError("사용 가능한 아이디입니다.");
        } else {
            setIsUsernameAvailable(false);
            setError("이미 사용 중인 아이디입니다.");
        }
        setLoading(false);
    };

    const handleSendCode = async () => {
        if (!phoneNumber.startsWith('010') || phoneNumber.length < 10) { setError("올바른 휴대폰 번호를 입력하세요."); return; }
        setLoading(true);
        setError('');
        try {
            const appVerifier = setupRecaptcha();
            const formattedPhoneNumber = '+82' + phoneNumber.substring(1); // 010 -> +8210
            const result = await signInWithPhoneNumber(auth, formattedPhoneNumber, appVerifier);
            setConfirmationResult(result);
            setStep('code');
            setTimer(180);
        } catch (err) {
            setError("인증번호 발송에 실패했습니다. 잠시 후 다시 시도해주세요.");
            console.error(err);
        }
        setLoading(false);
    };
    
    const handleVerifyCode = async () => {
        if (!verificationCode || verificationCode.length !== 6) { setError("인증번호 6자리를 입력하세요."); return; }
        setLoading(true);
        setError('');
        try {
            await confirmationResult.confirm(verificationCode);
            setIsPhoneVerified(true);
            setError("인증에 성공했습니다!");
            setStep('verified');
        } catch (err) {
            setError("인증번호가 올바르지 않습니다.");
        }
        setLoading(false);
    };

    const handleSignUp = async () => {
        if (!isUsernameAvailable) { setError("아이디 중복 확인을 해주세요."); return; }
        if (!isPhoneVerified) { setError("휴대폰 인증을 완료해주세요."); return; }
        if (password.length < 6) { setError("비밀번호는 6자리 이상이어야 합니다."); return; }
        
        setLoading(true);
        setError('');
        try {
            // Firebase Auth에는 아이디 개념이 없으므로, 이메일 형식으로 변환하여 계정 생성
            const email = `${username}@cockstar.app`;
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                username: username, // 로그인 시 사용할 아이디
                phoneNumber: phoneNumber,
                name: username, // 초기 닉네임
                level: 'D조',
                gender: '남',
            });
            goToPage('lobby');
        } catch (err) {
            setError("회원가입에 실패했습니다.");
            console.error(err);
        }
        setLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const email = `${loginId}@cockstar.app`; // 로그인 시에도 아이디를 이메일로 변환
            await signInWithEmailAndPassword(auth, email, loginPassword);
            goToPage('lobby');
        } catch (err) {
            setError("아이디 또는 비밀번호가 일치하지 않습니다.");
        }
        setLoading(false);
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div id="recaptcha-container"></div>
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <div className="flex justify-center mb-6"><StarIcon /><h1 className="text-3xl font-bold text-yellow-400 ml-2">Cock Star</h1></div>
                <h2 className="text-xl font-bold text-center text-white mb-6">{isSignUp ? '회원가입' : '로그인'}</h2>
                
                {isSignUp ? (
                    <div className="space-y-4">
                        {step === 'details' && (
                            <>
                                <div className="flex gap-2">
                                    <input type="text" placeholder="아이디" value={username} onChange={e => {setUsername(e.target.value); setIsUsernameAvailable(null); setError('');}} className="w-full bg-gray-700 p-3 rounded-lg" />
                                    <button onClick={checkUsernameAvailability} disabled={loading} className="bg-gray-600 px-3 rounded-lg text-sm">{loading ? '확인중' : '중복확인'}</button>
                                </div>
                                <input type="password" placeholder="비밀번호 (6자리 이상)" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
                                <div className="flex gap-2">
                                    <input type="tel" placeholder="휴대폰 번호 ('-' 제외)" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
                                    <button onClick={handleSendCode} disabled={loading} className="bg-green-600 px-3 rounded-lg text-sm">{loading ? '...' : '인증'}</button>
                                </div>
                            </>
                        )}

                        {step === 'code' && (
                             <>
                                <p className="text-center text-sm text-gray-300">{phoneNumber}로 인증번호를 발송했습니다.</p>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="인증번호 6자리" value={verificationCode} onChange={e => setVerificationCode(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" />
                                    <span className="flex items-center text-red-500">{Math.floor(timer/60)}:{String(timer%60).padStart(2,'0')}</span>
                                </div>
                                <button onClick={handleVerifyCode} disabled={loading || timer === 0} className="w-full bg-yellow-500 text-black font-bold py-3 rounded-lg">{loading ? '확인 중...' : '인증 확인'}</button>
                            </>
                        )}
                        
                        {step === 'verified' && (
                            <button onClick={handleSignUp} disabled={loading} className="w-full bg-yellow-500 text-black font-bold py-3 rounded-lg">가입 완료하기</button>
                        )}

                        {error && <p className={`text-sm text-center ${isUsernameAvailable ? 'text-green-500' : 'text-red-500'}`}>{error}</p>}
                    </div>
                ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input type="text" placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" required/>
                        <input type="password" placeholder="비밀번호" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full bg-gray-700 p-3 rounded-lg" required/>
                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                        <button type="submit" disabled={loading} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg">{loading ? '로그인 중...' : '로그인'}</button>
                    </form>
                )}

                <button onClick={() => { setIsSignUp(!isSignUp); setError(''); setStep('details'); }} className="w-full mt-4 text-center text-sm text-gray-400 hover:text-white">{isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}</button>
                <button onClick={() => goToPage('lobby')} className="w-full mt-6 text-center text-sm text-gray-400 hover:text-white">← 로비로 돌아가기</button>
            </div>
        </div>
    );
}

// ... (ProfilePage, LobbyPage, GameRoomPage 및 하위 컴포넌트들은 이전 버전과 동일하게 유지됩니다)
// ... (이하 모든 코드는 이전 답변의 최종 안정화 버전을 그대로 사용합니다)

function ProfilePage({ userData, goToPage }) {
    const handleSignOut = async () => {
        await signOut(auth);
        goToPage('lobby');
    };
    return (
         <div className="p-4">
            <h1 className="text-2xl font-bold text-yellow-400 mb-6">내 프로필</h1>
            {userData && (
                <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                    <p><span className="font-bold text-gray-400">아이디:</span> {userData.username}</p>
                    <p><span className="font-bold text-gray-400">닉네임:</span> {userData.name}</p>
                    <p><span className="font-bold text-gray-400">연락처:</span> {userData.phoneNumber}</p>
                </div>
            )}
            <button onClick={handleSignOut} className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition">로그아웃</button>
            <button onClick={() => goToPage('lobby')} className="w-full mt-4 text-center text-sm text-gray-400 hover:text-white">← 로비로 돌아가기</button>
        </div>
    )
}

function LobbyPage({ goToPage }) {
    const [rooms, setRooms] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    useEffect(() => {
        const roomsRef = collection(db, 'rooms');
        const q = query(roomsRef);
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const roomsData = [];
            querySnapshot.forEach((doc) => {
                roomsData.push({ id: doc.id, ...doc.data() });
            });
            setRooms(roomsData);
        });
        return () => unsubscribe();
    }, []);

    const handleCreateRoom = async () => {
        const user = auth.currentUser;
        if(!user) { goToPage('auth'); return; }
        const roomName = prompt("방 이름을 입력하세요 (예: 수원클럽)");
        if (roomName) {
            await addDoc(collection(db, 'rooms'), {
                name: roomName, owner: user.uid, createdAt: new Date().toISOString(),
                scheduledMatches: {}, inProgressCourts: [null, null, null, null],
            });
        }
    };
    
    const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="p-2">
            <header className="flex justify-between items-center p-2">
                <div className="flex items-center"><StarIcon /><h1 className="text-lg font-bold text-yellow-400 ml-2">Cock Star</h1></div>
                <button onClick={() => goToPage(auth.currentUser ? 'profile' : 'auth')}><UserIcon /></button>
            </header>
            
            <main className="p-2">
                <div className="relative mb-4">
                    <SearchIcon />
                    <input type="text" placeholder="방 이름 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-gray-800 text-white p-3 pl-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400"/>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredRooms.map(room => (
                        <div key={room.id} onClick={() => goToPage('room', room.id)} className="bg-gray-800 p-4 rounded-lg cursor-pointer hover:bg-gray-700 transition">
                            <h2 className="text-lg font-bold text-white">{room.name}</h2>
                        </div>
                    ))}
                </div>
                <button onClick={handleCreateRoom} className="mt-6 w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">방 만들기</button>
            </main>
        </div>
    );
}

function GameRoomPage({ user, userData, goToPage, roomId }) {
    const [roomData, setRoomData] = useState(null);
    const [players, setPlayers] = useState({});
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    
    const roomRef = useMemo(() => doc(db, "rooms", roomId), [roomId]);
    const playersColRef = useMemo(() => collection(roomRef, "players"), [roomRef]);

    useEffect(() => {
        if (!user || !userData) return;
        const playerRef = doc(playersColRef, user.uid);
        getDoc(playerRef).then(docSnap => {
            let gamesPlayed = 0;
            if(docSnap.exists()) gamesPlayed = docSnap.data().gamesPlayed || 0;
            setDoc(playerRef, {
                id: generateId(userData.name), name: userData.name, gender: userData.gender, level: userData.level,
                gamesPlayed: gamesPlayed, entryTime: new Date().toISOString()
            }, { merge: true });
        });
    }, [user, userData, playersColRef]);

    useEffect(() => {
        const unsubRoom = onSnapshot(roomRef, (doc) => {
            if (doc.exists()) setRoomData(doc.data());
            else goToPage('lobby');
        });
        const unsubPlayers = onSnapshot(playersColRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => { playersData[doc.id] = { uid: doc.id, ...doc.data() }; });
            setPlayers(playersData);
        });
        return () => { unsubRoom(); unsubPlayers(); };
    }, [roomRef, playersColRef, goToPage]);

    const handleExitRoom = async () => {
        try {
            await deleteDoc(doc(playersColRef, user.uid));
            goToPage('lobby');
        } catch (error) { console.error("방 나가기 오류:", error); }
    };
    
    // ... (이하 코드는 이전 최종 안정화 버전과 거의 동일합니다)
    const isAdmin = useMemo(() => userData && ADMIN_NAMES.includes(userData.name), [userData]);
    // ...
    // ... 모든 핸들러 함수들 ...
    // ...

    if (!roomData || !userData) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">방에 입장하는 중...</div>
    }

    const waitingPlayers = Object.values(players).sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
    const maleWaitingPlayers = waitingPlayers.filter(p => p.gender === '남');
    const femaleWaitingPlayers = waitingPlayers.filter(p => p.gender === '여');

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
             {/* 모든 모달 컴포넌트들이 여기에 위치합니다 */}

            <header className="flex-shrink-0 p-2 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-lg font-bold text-yellow-400">{roomData.name}</h1>
                <div className="text-right">
                    <span className="text-xs">{isAdmin ? '👑' : ''} {userData.name}</span>
                    <button onClick={handleExitRoom} className="ml-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs">나가기</button>
                </div>
            </header>

            <main className="flex-grow flex flex-col gap-4 p-1">
                <section className="flex-shrink-0 bg-gray-800/50 rounded-lg p-2">
                    <h2 className="text-sm font-bold mb-2 text-yellow-400">대기자 명단 ({waitingPlayers.length})</h2>
                     {/* ... (이전과 동일한 대기자 명단 UI) ... */}
                 </section>
                <section>
                    <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 예정</h2>
                     {/* ... (이전과 동일한 경기 예정 UI) ... */}
                </section>
                <section>
                    <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 진행 코트</h2>
                     {/* ... (이전과 동일한 경기 진행 UI) ... */}
                </section>
            </main>
            <style>{`.player-card {-webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;}`}</style>
        </div>
    );
}

// ... (모든 Modal 컴포넌트, PlayerCard, EmptySlot 등 하위 컴포넌트들을 여기에 붙여넣습니다)

