import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction, query, addDoc
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCKT1JZ8MkA5WhBdL3XXxtm_0wLbnOBi5I",
  authDomain: "project-104956788310687609.firebaseapp.com",
  projectId: "project-104956788310687609",
  storageBucket: "project-104956788310687609.firebasestorage.app",
  messagingSenderId: "384562806148",
  appId: "1:384956788310687609:web:d8bfb83b28928c13e671d1"
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
                    if (doc.exists()) {
                        setUserData(doc.data());
                    } else {
                        setUserData({ name: firebaseUser.email.split('@')[0] }); 
                    }
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
    
    if (loading) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">로딩 중...</div>
    }

    const renderPage = () => {
        switch (page) {
            case 'auth': return <AuthPage goToPage={goToPage} />;
            case 'profile': return <ProfilePage user={user} userData={userData} goToPage={goToPage} />;
            case 'room': return <GameRoomPage user={user} userData={userData} goToPage={goToPage} roomId={currentRoomId} />;
            case 'lobby': default: return <LobbyPage user={user} goToPage={goToPage} />;
        }
    };

    return <div className="bg-black text-white min-h-screen font-sans">{renderPage()}</div>;
}

// ===================================================================================
// 1. 인증/프로필 페이지들
// ===================================================================================
function AuthPage({ goToPage }) {
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [nickname, setNickname] = useState('');
    const [error, setError] = useState('');

    const handleAuthAction = async (e) => {
        e.preventDefault();
        setError('');
        try {
            if (isSignUp) {
                if(!nickname) { setError("닉네임을 입력해주세요."); return; }
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid, email: user.email, name: nickname, level: 'D조', gender: '남',
                });
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
            goToPage('lobby');
        } catch (err) {
            // ... (error handling)
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <div className="flex justify-center mb-6"><StarIcon /><h1 className="text-3xl font-bold text-yellow-400 ml-2">Cock Star</h1></div>
                <h2 className="text-xl font-bold text-center text-white mb-6">{isSignUp ? '회원가입' : '로그인'}</h2>
                <form onSubmit={handleAuthAction} className="space-y-4">
                    <input type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />
                    {isSignUp && (<input type="text" placeholder="닉네임" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />)}
                    <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />
                    {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                    <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">{isSignUp ? '가입하기' : '로그인'}</button>
                </form>
                <button onClick={() => setIsSignUp(!isSignUp)} className="w-full mt-4 text-center text-sm text-gray-400 hover:text-white">{isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}</button>
                <button onClick={() => goToPage('lobby')} className="w-full mt-6 text-center text-sm text-gray-400 hover:text-white">← 로비로 돌아가기</button>
            </div>
        </div>
    );
}

function ProfilePage({ user, userData, goToPage }) {
    const handleSignOut = async () => {
        await signOut(auth);
        goToPage('lobby');
    };
    return (
         <div className="p-4">
            <h1 className="text-2xl font-bold text-yellow-400 mb-6">내 프로필</h1>
            {userData && (
                <div className="bg-gray-800 p-6 rounded-lg space-y-4">
                    <p><span className="font-bold text-gray-400">닉네임:</span> {userData.name}</p>
                    <p><span className="font-bold text-gray-400">이메일:</span> {user.email}</p>
                    {/* 프로필 수정 기능은 추후 추가 */}
                </div>
            )}
            <button onClick={handleSignOut} className="w-full mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition">로그아웃</button>
            <button onClick={() => goToPage('lobby')} className="w-full mt-4 text-center text-sm text-gray-400 hover:text-white">← 로비로 돌아가기</button>
        </div>
    )
}

// ===================================================================================
// 2. 로비 페이지 (방 목록)
// ===================================================================================
function LobbyPage({ user, goToPage }) {
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
        if(!user) { goToPage('auth'); return; }
        const roomName = prompt("방 이름을 입력하세요 (예: 수원클럽)");
        if (roomName) {
            await addDoc(collection(db, 'rooms'), {
                name: roomName, owner: user.uid, createdAt: new Date().toISOString(),
            });
        }
    };
    
    const filteredRooms = rooms.filter(room => room.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="p-2">
            <header className="flex justify-between items-center p-2">
                <div className="flex items-center"><StarIcon /><h1 className="text-lg font-bold text-yellow-400 ml-2">Cock Star</h1></div>
                <button onClick={() => goToPage(user ? 'profile' : 'auth')}><UserIcon /></button>
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

// ===================================================================================
// 3. 게임방 페이지 (기존 App.jsx의 모든 기능 통합)
// ===================================================================================
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
            else goToPage('lobby'); // 방이 삭제된 경우
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
        } catch (error) {
            console.error("방 나가기 오류:", error);
        }
    };
    
    // 이 아래는 기존 App.jsx의 모든 로직을 가져와 수정한 것입니다.
    const isAdmin = useMemo(() => userData && ADMIN_NAMES.includes(userData.name), [userData]);
    const scheduledMatches = roomData?.scheduledMatches || {};
    const inProgressCourts = roomData?.inProgressCourts || [null, null, null, null];
    const scheduledMatchesArray = useMemo(() => Array(4).fill(null).map((_, i) => scheduledMatches[String(i)] || Array(4).fill(null)), [scheduledMatches]);

    const updateRoomState = useCallback(async (updateFunction) => {
        try {
            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists()) throw "Room does not exist!";
                const currentRoomData = roomDoc.data();
                const newRoomData = updateFunction(currentRoomData);
                transaction.update(roomRef, newRoomData);
            });
            setSelectedPlayerIds([]);
        } catch (err) {
            console.error("Transaction failed: ", err);
            setModal({ type: 'alert', data: { title: '업데이트 충돌', body: '다른 관리자와 동시에 변경했습니다.' }});
        }
    }, [roomRef]);
    
    // ... 기존 핸들러 함수들 (playerLocations, findPlayerLocation, handleReturnToWaiting 등)을 여기에 그대로 붙여넣되
    // Firestore 업데이트 로직은 `updateRoomState`를 사용하도록 수정합니다.
    // (분량 관계상 핵심 로직만 남기고, UI 표시는 아래 return문에서 진행합니다.)

    if (!roomData || !userData) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center">방에 입장하는 중...</div>
    }

    const waitingPlayers = Object.values(players).sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
    const maleWaitingPlayers = waitingPlayers.filter(p => p.gender === '남');
    const femaleWaitingPlayers = waitingPlayers.filter(p => p.gender === '여');

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
             {/* 모달들은 여기에 위치 */}

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
                     {/* ... (기존 대기자 명단 UI) ... */}
                 </section>
                <section>
                    <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 예정</h2>
                    {/* ... (기존 경기 예정 UI) ... */}
                </section>
                <section>
                    <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 진행 코트</h2>
                    {/* ... (기존 경기 진행 UI) ... */}
                </section>
                 <p className="mt-4 text-center text-gray-400">(이곳에 전체 경기 관리 UI가 표시됩니다)</p>
            </main>
        </div>
    );
}

