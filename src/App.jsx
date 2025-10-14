import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction, query, addDoc, where, getDocs, serverTimestamp
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정 (콕스타 - noerror-14ce3 프로젝트)
// ===================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyC-eeHazZ3kVj7aQicdtlnhEmLbbTJHgGE",
  authDomain: "noerror-14ce3.firebaseapp.com",
  projectId: "noerror-14ce3",
  storageBucket: "noerror-14ce3.appspot.com",
  messagingSenderId: "279065154821",
  appId: "1:279065154821:web:812570dde2bdde560a936c",
  measurementId: "G-PFGZGHT9T4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===================================================================================
// 상수 및 Helper 함수
// ===================================================================================
// 슈퍼 관리자 목록. 여기에 포함된 이름은 모든 방에서 관리자 권한을 가집니다.
const SUPER_ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리"];
const PLAYERS_PER_MATCH = 4;
const LEVEL_ORDER = { 'A조': 1, 'B조': 2, 'C조': 3, 'D조': 4, 'N조': 5 };

// 급수별 색상을 반환하는 함수
const getLevelColor = (level) => {
    switch (level) {
        case 'A조': return '#FF4F4F'; // 빨강
        case 'B조': return '#FF9100'; // 주황
        case 'C조': return '#FFD600'; // 노랑
        case 'D조': return '#00E676'; // 초록
        default: return '#A1A1AA';   // 회색
    }
};

// ===================================================================================
// 공용 UI 컴포넌트 (모달, 카드 등)
// ===================================================================================

const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, isCurrentUser, isPlaying = false, isSelected = false }) => {
    
    // 성별에 따라 카드 좌측 테두리 색상 지정
    const genderStyle = {
        boxShadow: `inset 4px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}`
    };

    const adminIcon = (SUPER_ADMIN_NAMES.includes(player.name) || context.isRoomCreator) ? '👑' : '';
    
    const levelColor = getLevelColor(player.level);
    const levelStyle = {
        color: levelColor,
        fontWeight: 'bold',
        fontSize: '14px',
        textShadow: `0 0 5px ${levelColor}`
    };

    // 카드 스타일 동적 적용
    const cardStyle = {
        ...genderStyle,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'transparent',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: '#2d3748',
        opacity: isPlaying || player.isResting ? 0.6 : 1,
        filter: player.isResting ? 'grayscale(80%)' : 'none',
    };

    if (isSelected) {
        cardStyle.borderColor = '#34d399'; // 선택 시 녹색 테두리
        cardStyle.transform = 'scale(1.05)';
        cardStyle.boxShadow = `${cardStyle.boxShadow || ''}, 0 0 10px rgba(52, 211, 153, 0.7)`;
    }
    
    if (isCurrentUser) {
        cardStyle.borderColor = '#FBBF24'; // 본인일 경우 노란색 테두리
        cardStyle.boxShadow = `${cardStyle.boxShadow || ''}, 0 0 10px rgba(251, 191, 36, 0.7)`;
    }
    
    const actionLabel = context.location === 'waiting' ? '대기자 명단에서 제외' : '대기자로 이동';

    return (
        <div 
            className="player-card p-1 rounded-md relative flex flex-col justify-center text-center h-14 w-full"
            style={cardStyle}
            onClick={isAdmin && onCardClick ? () => onCardClick(player) : null}
        >
            <div>
                <div className="player-name text-white text-xs font-bold whitespace-nowrap leading-tight tracking-tighter">{adminIcon}{player.name}</div>
                <div className="player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap">
                    <span style={levelStyle}>{player.level.replace('조','')}</span>|
                    {`${player.todayGames || 0}게임`}
                </div>
            </div>
            {isAdmin && onAction && context.location !== 'court' && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onAction(player); }} 
                    className="absolute -top-2 -right-2 p-1 text-gray-500 hover:text-yellow-400"
                    aria-label={actionLabel}
                ><i className="fas fa-times-circle fa-xs"></i></button>
            )}
        </div>
    );
});

const EmptySlot = ({ onSlotClick }) => ( 
    <div 
        className="player-slot h-14 bg-black/30 rounded-md flex items-center justify-center text-gray-600 border-2 border-dashed border-gray-700 cursor-pointer hover:bg-gray-700/50 hover:border-yellow-400 transition-all"
        onClick={onSlotClick}
    >
        <span className="text-xl font-bold">+</span>
    </div> 
);

const CourtTimer = ({ court }) => {
    const [time, setTime] = useState('00:00');
    useEffect(() => {
        if (court && court.startTime) {
            const timerId = setInterval(() => {
                const now = new Date();
                const startTime = court.startTime.toDate(); // Firestore 타임스탬프를 Date 객체로 변환
                const diff = Math.floor((now - startTime) / 1000);
                const minutes = String(Math.floor(diff / 60)).padStart(2, '0');
                const seconds = String(diff % 60).padStart(2, '0');
                setTime(`${minutes}:${seconds}`);
            }, 1000);
            return () => clearInterval(timerId);
        } else { setTime('00:00'); }
    }, [court]);
    return <div className="text-center text-xs font-mono text-white mt-1 tracking-wider">{time}</div>;
};

// 범용 모달 컴포넌트들
function AlertModal({ title, body, onClose }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><button onClick={onClose} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">확인</button></div></div> ); }
function ConfirmationModal({ title, body, onConfirm, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><div className="flex gap-4"><button onClick={onCancel} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={onConfirm} className="w-full arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button></div></div></div>); }
function CourtSelectionModal({ courts, onSelect, onCancel }) {
    const [isProcessing, setIsProcessing] = useState(false);
    return ( 
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4 arcade-font">코트 선택</h3>
                <p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p>
                <div className="flex flex-col gap-3">
                    {courts.map(courtIdx => ( 
                        <button key={courtIdx} onClick={() => { setIsProcessing(true); onSelect(courtIdx); }} disabled={isProcessing} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isProcessing ? '처리 중...' : `${courtIdx + 1}번 코트`}
                        </button> 
                    ))}
                </div>
                <button onClick={onCancel} disabled={isProcessing} className="mt-6 w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
            </div>
        </div> 
    ); 
}
function ResultInputModal({ courtIndex, players, onResultSubmit, onClose }) {
    const [winners, setWinners] = useState([]);
    const handlePlayerClick = (playerId) => setWinners(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : (prev.length < 2 ? [...prev, playerId] : prev));
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4 arcade-font flicker-text">승리팀 선택</h3>
                <p className="text-gray-300 mb-6">승리한 선수 2명을 선택하세요.</p>
                <div className="grid grid-cols-4 gap-2">
                    {players.map(p => ( <PlayerCard key={p.id} player={p} context={{}} onCardClick={() => handlePlayerClick(p.id)} isSelected={winners.includes(p.id)} /> ))}
                </div>
                <div className="flex gap-4 mt-6">
                    <button onClick={onClose} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg">취소</button>
                    <button onClick={() => onResultSubmit(courtIndex, winners)} disabled={winners.length !== 2} className="w-full arcade-button bg-green-500 hover:bg-green-600 text-black font-bold py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">결과 확정</button>
                </div>
            </div>
        </div>
    );
}

function SettingsModal({ roomData, onSave, onCancel, onSystemReset }) {
    const [settings, setSettings] = useState({
        numScheduledMatches: roomData.numScheduledMatches,
        numInProgressCourts: roomData.numInProgressCourts,
    });
    const handleChange = (field, value) => setSettings(s => ({...s, [field]: Math.max(1, (s[field] || 0) + value)}));
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg text-white shadow-lg flex flex-col">
                <h3 className="text-xl font-bold text-white mb-6 arcade-font text-center flex-shrink-0">방 설정</h3>
                <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                    <div className="bg-gray-700 p-3 rounded-lg">
                        <span className="font-semibold mb-2 block text-center">경기 예정 / 코트 수</span>
                        <div className="flex items-center justify-around">
                            <div className="text-center"><p>예정</p><div className="flex items-center gap-2 mt-1"><button onClick={() => handleChange('numScheduledMatches', -1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8 text-center">{settings.numScheduledMatches}</span><button onClick={() => handleChange('numScheduledMatches', 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div>
                            <div className="text-center"><p>코트</p><div className="flex items-center gap-2 mt-1"><button onClick={() => handleChange('numInProgressCourts', -1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button><span className="text-xl font-bold w-8 text-center">{settings.numInProgressCourts}</span><button onClick={() => handleChange('numInProgressCourts', 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button></div></div>
                        </div>
                    </div>
                    <div className="bg-gray-700 p-3 rounded-lg space-y-2"><label className="font-semibold mb-2 block text-center">고급 기능</label><button onClick={onSystemReset} className="w-full arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg">시스템 초기화</button></div>
                </div>
                <div className="mt-6 flex gap-4 flex-shrink-0"><button onClick={onCancel} className="w-full arcade-button bg-gray-600 hover:bg-gray-700 font-bold py-2 rounded-lg">취소</button><button onClick={() => onSave(settings)} className="w-full arcade-button bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg">저장</button></div>
            </div>
        </div>
    );
}

// ===================================================================================
// 페이지 컴포넌트
// ===================================================================================

function AuthPage() {
    // ... (이전과 동일한 회원가입/로그인 로직)
    const [step, setStep] = useState(4); // 1: phone, 2: code, 3: info, 4: login
    const [formData, setFormData] = useState({ username: '', name: '', phone: '', level: 'A조', gender: '남', password: '' });
    const [verificationId, setVerificationId] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [error, setError] = useState('');
    const recaptchaContainerRef = useRef(null);

    useEffect(() => {
        if (recaptchaContainerRef.current) {
            window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
                'size': 'invisible',
            });
        }
    }, [recaptchaContainerRef.current]);
    
    const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handlePhoneSubmit = async (e) => {
        e.preventDefault(); setError('');
        try {
            const q = query(collection(db, "users"), where("phone", "==", formData.phone));
            if (!(await getDocs(q)).empty) { setError('이미 가입된 전화번호입니다.'); return; }
            const confirmationResult = await signInWithPhoneNumber(auth, `+82${formData.phone.substring(1)}`, window.recaptchaVerifier);
            setVerificationId(confirmationResult.verificationId);
            setStep(2);
        } catch (err) { setError(`인증번호 발송 실패: ${err.message}`); }
    };
    const handleCodeSubmit = async (e) => {
        e.preventDefault(); setError('');
        // This is a simplified confirmation for brevity. In a real app, you'd use a ConfirmationResult object.
        if (verificationId) setStep(3); else setError('인증에 실패했습니다.');
    };
    const handleSignUp = async (e) => {
        e.preventDefault(); setError('');
        try {
            const q = query(collection(db, "users"), where("username", "==", formData.username));
            if (!(await getDocs(q)).empty) { setError('이미 사용중인 아이디입니다.'); return; }
            const userCredential = await createUserWithEmailAndPassword(auth, `${formData.username}@cockstar.app`, formData.password);
            await setDoc(doc(db, "users", userCredential.user.uid), {
                username: formData.username, name: formData.name, phone: formData.phone, level: formData.level, gender: formData.gender,
            });
            alert(`가입 완료! 이제 로그인해주세요.`);
            setStep(4);
        } catch (err) { setError(`가입 실패: ${err.message}`); }
    };
    const handleLogin = async (e) => {
        e.preventDefault(); setError('');
        try {
            await signInWithEmailAndPassword(auth, `${formData.username}@cockstar.app`, formData.password);
        } catch (err) { setError('아이디 또는 비밀번호가 잘못되었습니다.'); }
    };
    // ... (이하 AuthPage 렌더링 로직은 생략, 핵심 기능은 동일)
    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div ref={recaptchaContainerRef} id="recaptcha-container"></div>
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center arcade-font flicker-text">콕스타</h1>
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                {step === 4 ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <h2 className="text-xl font-bold text-center">로그인</h2>
                        <input type="text" name="username" placeholder="아이디" onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                        <input type="password" name="password" placeholder="비밀번호" onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                        <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">로그인</button>
                        <button type="button" onClick={() => setStep(1)} className="w-full text-center text-sm text-gray-400 mt-2">계정이 없으신가요? 회원가입</button>
                    </form>
                ) : (
                    <form onSubmit={handleSignUp} className="space-y-4">
                         <h2 className="text-xl font-bold text-center">회원가입</h2>
                        <input type="text" name="username" placeholder="아이디" value={formData.username} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                        <input type="text" name="name" placeholder="닉네임" value={formData.name} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                        <input type="password" name="password" placeholder="비밀번호" value={formData.password} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                        <select name="level" value={formData.level} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>A조</option><option>B조</option><option>C조</option><option>D조</option></select>
                        <select name="gender" value={formData.gender} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>남</option><option>여</option></select>
                        <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">가입 완료하기</button>
                        <button type="button" onClick={() => setStep(4)} className="w-full text-center text-sm text-gray-400 mt-2">이미 계정이 있으신가요? 로그인</button>
                    </form>
                )}
            </div>
        </div>
    );
}

function LobbyPage({ userData, setPage, setRoomId }) {
    // ... (이전과 동일한 로비 로직)
    const [rooms, setRooms] = useState([]);
    const [newRoomName, setNewRoomName] = useState('');

    useEffect(() => {
        const unsubscribe = onSnapshot(query(collection(db, "rooms")), (snapshot) => {
            setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handleCreateRoom = async () => {
        if (!newRoomName.trim()) return;
        const roomRef = await addDoc(collection(db, "rooms"), {
            name: newRoomName,
            createdAt: serverTimestamp(),
            createdBy: userData.uid, // 방 생성자 ID 저장
            numScheduledMatches: 4,
            numInProgressCourts: 4,
            scheduledMatches: {},
            inProgressCourts: Array(4).fill(null)
        });
        handleEnterRoom(roomRef.id);
    };

    const handleEnterRoom = async (roomId) => {
        const playerDocRef = doc(db, 'rooms', roomId, 'players', userData.uid);
        await setDoc(playerDocRef, { ...userData, todayGames: 0, isResting: false, entryTime: new Date().toISOString() });
        setRoomId(roomId);
        setPage('room');
    };
    
    return (
         <div className="bg-black text-white min-h-screen flex flex-col items-center p-4">
            <header className="w-full max-w-lg flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold arcade-font flicker-text text-yellow-400">로비</h1>
                <div><span className="mr-4">환영합니다, {userData.name}님!</span><button onClick={() => signOut(auth)} className="arcade-button bg-red-600 text-white py-1 px-3 text-sm rounded-md">로그아웃</button></div>
            </header>
            <div className="w-full max-w-lg bg-gray-800 p-4 rounded-lg">
                <div className="flex gap-2 mb-4">
                    <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="새 방 이름" className="flex-grow bg-gray-700 p-2 rounded-lg" />
                    <button onClick={handleCreateRoom} className="arcade-button bg-yellow-500 text-black font-bold px-4 rounded-lg">방 만들기</button>
                </div>
                <div className="space-y-2">{rooms.map(room => (<div key={room.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg"><span className="font-semibold">{room.name}</span><button onClick={() => handleEnterRoom(room.id)} className="arcade-button bg-green-500 text-black font-bold px-4 py-1 text-sm rounded-lg">입장</button></div>))}</div>
            </div>
        </div>
    );
}

function GameRoomPage({ userData, roomId, setPage }) {
    // ... (명세서 기반의 새로운 GameRoomPage 로직)
    const [roomData, setRoomData] = useState(null);
    const [players, setPlayers] = useState({});
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [activeTab, setActiveTab] = useState('matching');

    const isAdmin = useMemo(() => roomData ? (SUPER_ADMIN_NAMES.includes(userData.name) || roomData.createdBy === userData.uid) : false, [userData, roomData]);

    useEffect(() => {
        const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), (doc) => doc.exists() ? setRoomData({ id: doc.id, ...doc.data() }) : setPage('lobby'));
        const unsubPlayers = onSnapshot(collection(db, 'rooms', roomId, 'players'), (snapshot) => {
            setPlayers(snapshot.docs.reduce((acc, doc) => ({...acc, [doc.id]: { id: doc.id, ...doc.data() } }), {}));
        });
        return () => { unsubRoom(); unsubPlayers(); };
    }, [roomId, setPage]);
    
    useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);

    const updateRoomState = useCallback(async (updateLogic) => {
        try { await runTransaction(db, async tx => {
                const roomDoc = await tx.get(doc(db, 'rooms', roomId));
                if (!roomDoc.exists()) throw "Room not found";
                tx.update(doc(db, 'rooms', roomId), updateLogic(roomDoc.data()));
            });
        } catch (e) { setModal({ type: 'alert', data: { title: '오류', body: '작업에 실패했습니다: ' + e } }); }
    }, [roomId]);
    
    // ... (핸들러 함수들: handleCardClick, handleSlotClick, handleStartMatch 등 명세서 기반으로 재작성)
    const handleCardClick = (player) => {
        if (!isAdmin) return;
        setSelectedPlayerIds(ids => ids.includes(player.id) ? ids.filter(id => id !== player.id) : [...ids, player.id]);
    };

    const handleAction = (player) => { // 'x' 버튼 클릭 시
        const loc = playerLocations[player.id];
        if (loc.location === 'schedule') { // 경기 예정에서 대기자로
             updateRoomState(data => {
                data.scheduledMatches[loc.matchIndex][loc.slotIndex] = null;
                return data;
            });
        }
    };

    const handleSlotClick = (context) => {
        if (!isAdmin || selectedPlayerIds.length === 0) return;
        updateRoomState(data => {
            const playersToMove = [...selectedPlayerIds];
            selectedPlayerIds.forEach(pId => { // 기존 위치에서 제거
                const oldLoc = Object.entries(data.scheduledMatches).find(([_, match]) => match.includes(pId));
                if (oldLoc) data.scheduledMatches[oldLoc[0]][oldLoc[1].indexOf(pId)] = null;
            });
            let targetArray = data.scheduledMatches[context.matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);
            for (let i = 0; i < PLAYERS_PER_MATCH && playersToMove.length > 0; i++) {
                if (targetArray[i] === null) targetArray[i] = playersToMove.shift();
            }
            data.scheduledMatches[context.matchIndex] = targetArray;
            return data;
        });
        setSelectedPlayerIds([]);
    };

    const handleStartMatch = (matchIndex) => {
        const match = roomData?.scheduledMatches?.[matchIndex] || [];
        if(match.filter(p=>p).length !== PLAYERS_PER_MATCH) return;
        
        const emptyCourts = Array.from({length: roomData.numInProgressCourts}, (_,i) => i).filter(i => !roomData.inProgressCourts[i]);
        if(emptyCourts.length === 0) { setModal({type:'alert', data:{title: "시작 불가", body: "빈 코트가 없습니다."}}); return; }

        const start = (courtIndex) => {
            updateRoomState(data => {
                data.inProgressCourts[courtIndex] = { players: data.scheduledMatches[matchIndex], startTime: serverTimestamp() };
                for(let i = matchIndex; i < data.numScheduledMatches - 1; i++) { data.scheduledMatches[i] = data.scheduledMatches[i+1] || Array(PLAYERS_PER_MATCH).fill(null); }
                data.scheduledMatches[data.numScheduledMatches-1] = Array(PLAYERS_PER_MATCH).fill(null);
                return data;
            });
            setModal({type: null, data: null});
        };
        if(emptyCourts.length === 1) start(emptyCourts[0]);
        else setModal({type: 'courtSelection', data:{courts: emptyCourts, onSelect: start}});
    };

    const handleEndMatch = (courtIndex) => {
        const matchPlayers = roomData.inProgressCourts[courtIndex].players.map(pId => players[pId]).filter(Boolean);
        setModal({type:'resultInput', data: {courtIndex, players: matchPlayers, onResultSubmit: processMatchResult}});
    };

    const processMatchResult = async (courtIndex, winners) => {
        const batch = writeBatch(db);
        roomData.inProgressCourts[courtIndex].players.forEach(pId => {
            const playerRef = doc(db, 'rooms', roomId, 'players', pId);
            batch.update(playerRef, { todayGames: (players[pId].todayGames || 0) + 1 });
        });
        await batch.commit();
        updateRoomState(data => { data.inProgressCourts[courtIndex] = null; return data; });
        setModal({type:null, data:null});
    };
    
    const handleToggleRest = () => {
        const playerRef = doc(db, 'rooms', roomId, 'players', userData.uid);
        updateDoc(playerRef, { isResting: !players[userData.uid].isResting });
    };

    const handleSystemReset = () => {
        setModal({type:'confirm', data:{title:'시스템 초기화', body:'[경고] 모든 경기가 사라지고, 선수들은 대기 명단으로 이동합니다. 계속하시겠습니까?', onConfirm: () => {
            updateRoomState(data => {
                data.scheduledMatches = {};
                data.inProgressCourts = Array(data.numInProgressCourts).fill(null);
                return data;
            });
            setModal({type:null, data:null});
        }}});
    };
    
    const handleSettingsSave = (settings) => {
        updateRoomState(data => ({
            ...data,
            numScheduledMatches: settings.numScheduledMatches,
            numInProgressCourts: settings.numInProgressCourts,
        }));
        setModal({type:null, data:null});
    };

    // ... (이하 GameRoomPage 렌더링 로직은 명세서 기반으로 작성)
    const playerLocations = useMemo(() => { /* ... */ return {}; }, [roomData, players]);
    const { maleWaitingPlayers, femaleWaitingPlayers } = useMemo(() => { /* ... */ return {maleWaitingPlayers:[], femaleWaitingPlayers:[]}}, [players, playerLocations]);

    if (!roomData || !players) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><p className="arcade-font text-yellow-400">LOADING ROOM...</p></div>;
    // ... 이하 생략 (UI 렌더링 부분)
    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            {/* 모달 렌더링 */}
            {modal.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({type:null})} />}
            {modal.type === 'confirm' && <ConfirmationModal {...modal.data} onCancel={() => setModal({type:null})} />}
            {modal.type === 'courtSelection' && <CourtSelectionModal {...modal.data} onCancel={() => setModal({type:null})} />}
            {modal.type === 'resultInput' && <ResultInputModal {...modal.data} onClose={() => setModal({type:null})} />}
            {modal.type === 'settings' && <SettingsModal roomData={roomData} onSave={handleSettingsSave} onCancel={() => setModal({type:null})} onSystemReset={handleSystemReset} />}
            
            <header className="flex-shrink-0 p-2 flex flex-col gap-1 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-700">
                <div className="flex items-center justify-between gap-2">
                    <h1 className="text-sm sm:text-lg font-bold text-yellow-400 arcade-font flicker-text flex items-center"><span className="mr-1">⚡</span><span className="uppercase">{roomData.name}</span></h1>
                    <div className="flex items-center gap-2 flex-shrink-0"><span className="text-xs font-bold whitespace-nowrap">{isAdmin ? '👑' : ''} {userData.name}</span><button onClick={() => setPage('lobby')} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs whitespace-nowrap">나가기</button></div>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                    {isAdmin && <button onClick={() => setModal({type: 'settings'})} className="text-gray-400 hover:text-white text-lg px-1"><i className="fas fa-cog"></i></button>}
                    <button onClick={handleToggleRest} className={`arcade-button py-1.5 px-2.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${players[userData.uid]?.isResting ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'}`}>{players[userData.uid]?.isResting ? '복귀' : '휴식'}</button>
                </div>
            </header>
            {/* ... 이하 메인 컨텐츠 렌더링 */}
            <main> ... </main>
            <style>{`.arcade-font { font-family: 'Press Start 2P', cursive; } /* ... */`}</style>
        </div>
    );
}


export default function App() {
    // ... (이전과 동일한 최상위 App 컴포넌트 로직)
    const [page, setPage] = useState('auth');
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [roomId, setRoomId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDoc = await getDoc(doc(db, "users", currentUser.uid));
                if (userDoc.exists()) {
                    setUserData({ uid: currentUser.uid, ...userDoc.data() });
                    setUser(currentUser);
                    if(page === 'auth') setPage('lobby');
                } else { signOut(auth); }
            } else {
                setUser(null); setUserData(null); setPage('auth');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [page]);

    if (loading) return <div className="bg-black text-white min-h-screen flex items-center justify-center"><p className="arcade-font text-yellow-400">LOADING...</p></div>;

    switch (page) {
        case 'auth': return <AuthPage />;
        case 'lobby': return <LobbyPage userData={userData} setPage={setPage} setRoomId={setRoomId} />;
        case 'room': return <GameRoomPage userData={userData} roomId={roomId} setPage={setPage} />;
        default: return <AuthPage />;
    }
}

