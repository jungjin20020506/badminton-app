import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction, query, addDoc, where, getDocs
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
const ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리", "어드민"];
const PLAYERS_PER_MATCH = 4;
const LEVEL_ORDER = { 'A조': 1, 'B조': 2, 'C조': 3, 'D조': 4, 'N조': 5 };

const getLevelColor = (level) => {
    switch (level) {
        case 'A조': return '#FF4F4F';
        case 'B조': return '#FF9100';
        case 'C조': return '#FFD600';
        case 'D조': return '#00E676';
        default: return '#A1A1AA';
    }
};

// ===================================================================================
// 공용 UI 컴포넌트 (모달, 카드 등)
// ===================================================================================

const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, onLongPress, isCurrentUser, isMovable = true, isSelectedForWin = false, isPlaying = false }) => {
    const pressTimerRef = useRef(null);
    const cardRef = useRef(null);

    const stableOnLongPress = useCallback(() => {
        if(onLongPress) onLongPress(player);
    }, [onLongPress, player]);

    const handlePressStart = useCallback((e) => {
        if (!isMovable || !isAdmin) return;
        if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
        pressTimerRef.current = setTimeout(stableOnLongPress, 1000);
    }, [isAdmin, isMovable, stableOnLongPress]);
    
    const handlePressEnd = useCallback(() => {
        if (pressTimerRef.current) {
            clearTimeout(pressTimerRef.current);
            pressTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        const cardElement = cardRef.current;
        if (cardElement && isAdmin && isMovable) {
            const options = { passive: true };
            cardElement.addEventListener('touchstart', handlePressStart, options);
            cardElement.addEventListener('touchend', handlePressEnd);
            cardElement.addEventListener('touchcancel', handlePressEnd);
    
            return () => {
                cardElement.removeEventListener('touchstart', handlePressStart);
                cardElement.removeEventListener('touchend', handlePressEnd);
                cardElement.removeEventListener('touchcancel', handlePressEnd);
            };
        }
    }, [isAdmin, isMovable, handlePressStart, handlePressEnd]);
    
    const handleContextMenu = (e) => { e.preventDefault(); };
    
    const genderStyle = {
        boxShadow: `inset 4px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}`
    };

    const adminIcon = ADMIN_NAMES.includes(player.name) ? '👑' : '';
    const isWaiting = !context.location;
    const playerNameClass = `player-name text-white text-xs font-bold whitespace-nowrap leading-tight tracking-tighter`;
    const playerInfoClass = `player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap`;
    
    const levelColor = getLevelColor(player.level);
    
    const levelStyle = {
        color: levelColor,
        fontWeight: 'bold',
        fontSize: '14px',
        textShadow: `0 0 5px ${levelColor}`
    };

    const cardStyle = {
        ...genderStyle,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'transparent',
        transition: 'all 0.2s ease-in-out',
        backgroundColor: '#2d3748',
        opacity: isPlaying ? 0.6 : 1,
    };

    if (context.selected || isSelectedForWin) {
        cardStyle.borderColor = '#34d399';
        cardStyle.transform = 'scale(1.1)';
        cardStyle.boxShadow = `${cardStyle.boxShadow}, 0 0 15px 5px rgba(52, 211, 153, 0.9)`;
    }
    
    if (isCurrentUser) {
        cardStyle.borderColor = '#FBBF24';
        cardStyle.boxShadow = `${cardStyle.boxShadow}, 0 0 12px 4px rgba(251, 191, 36, 0.9)`;
    }
    
    const actionLabel = isWaiting ? '선수 내보내기' : '대기자로 이동';
    
    const todayWins = player.todayWins || 0;
    const todayLosses = player.todayLosses || 0;

    return (
        <div 
            ref={cardRef}
            className={`player-card p-1 rounded-md relative flex flex-col justify-center text-center h-14 w-full`}
            style={cardStyle}
            onClick={isMovable && onCardClick ? () => onCardClick() : null}
            onMouseDown={isAdmin && isMovable ? handlePressStart : null}
            onMouseUp={isAdmin && isMovable ? handlePressEnd : null}
            onMouseLeave={isAdmin && isMovable ? handlePressEnd : null}
            onContextMenu={handleContextMenu}
        >
            <div>
                <div className={playerNameClass}>{adminIcon}{player.name}</div>
                <div className={playerInfoClass}>
                    <span style={levelStyle}>{player.level.replace('조','')}</span>|
                    {`${todayWins}승 ${todayLosses}패`}
                </div>
            </div>
            {isAdmin && onAction && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onAction(player); }} 
                    className={`absolute -top-2 -right-2 p-1 text-gray-500 hover:text-yellow-400`}
                    aria-label={actionLabel}
                ><i className={"fas fa-times-circle fa-xs"}></i></button>
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
                const now = new Date().getTime();
                const startTime = new Date(court.startTime).getTime();
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

    const handlePlayerClick = (playerId) => {
        setWinners(prev => {
            if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
            if (prev.length < 2) return [...prev, playerId];
            return prev;
        });
    };

    useEffect(() => {
        if (winners.length === 2) {
            const timer = setTimeout(() => { onResultSubmit(courtIndex, winners); }, 500);
            return () => clearTimeout(timer);
        }
    }, [winners, courtIndex, onResultSubmit]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md text-center shadow-lg">
                <h3 className="text-xl font-bold text-yellow-400 mb-4 arcade-font flicker-text">승리팀 선택</h3>
                <p className="text-gray-300 mb-6">승리한 선수 2명을 선택하세요.</p>
                <div className="grid grid-cols-4 gap-2">
                    {players.map(p => (
                        <PlayerCard 
                            key={p.id} player={p} context={{}} isMovable={true}
                            onCardClick={() => handlePlayerClick(p.id)}
                            isSelectedForWin={winners.includes(p.id)}
                        />
                    ))}
                </div>
                <button onClick={onClose} className="mt-6 w-full arcade-button bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button>
            </div>
        </div>
    );
}

// ===================================================================================
// 게임방 페이지 (콕스라이팅 UI 통합)
// ===================================================================================
function GameRoomPage({ userData, roomId, setPage }) {
    const [roomData, setRoomData] = useState(null);
    const [players, setPlayers] = useState({});
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [activeTab, setActiveTab] = useState('matching');

    const isAdmin = useMemo(() => ADMIN_NAMES.includes(userData.name), [userData.name]);

    // Firestore 리스너 설정
    useEffect(() => {
        const roomDocRef = doc(db, 'rooms', roomId);
        const playersColRef = collection(db, 'rooms', roomId, 'players');

        const unsubRoom = onSnapshot(roomDocRef, (doc) => {
            if (doc.exists()) {
                setRoomData({ id: doc.id, ...doc.data() });
            } else {
                setPage('lobby'); // 방이 삭제되면 로비로 이동
            }
        });

        const unsubPlayers = onSnapshot(playersColRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => {
                playersData[doc.id] = { id: doc.id, ...doc.data() };
            });
            setPlayers(playersData);
        });

        return () => {
            unsubRoom();
            unsubPlayers();
        };
    }, [roomId, setPage]);
    
    // 모바일 뷰포트 감지
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const updateRoomData = useCallback(async (updateFunction) => {
        const roomDocRef = doc(db, 'rooms', roomId);
        try {
            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomDocRef);
                if (!roomDoc.exists()) throw new Error("Room does not exist!");
                const currentData = roomDoc.data();
                const newData = updateFunction(currentData);
                transaction.update(roomDocRef, newData);
            });
        } catch (error) {
            console.error("Room update failed: ", error);
            setModal({ type: 'alert', data: { title: '오류', body: '데이터 업데이트에 실패했습니다. ' + error.message } });
        }
    }, [roomId]);
    
    // 위치 계산 로직
    const playerLocations = useMemo(() => {
        const locations = {};
        if (!roomData) return locations;
        Object.keys(players).forEach(pId => locations[pId] = { location: 'waiting' });

        Object.keys(roomData.scheduledMatches || {}).forEach(matchKey => {
            const match = roomData.scheduledMatches[matchKey];
            if (match) match.forEach((pId, slotIdx) => {
                if(pId) locations[pId] = { location: 'schedule', matchIndex: parseInt(matchKey, 10), slotIndex: slotIdx };
            });
        });

        (roomData.inProgressCourts || []).forEach((court, courtIdx) => {
            if (court && court.players) court.players.forEach((pId, slotIdx) => {
                if(pId) locations[pId] = { location: 'court', matchIndex: courtIdx, slotIndex: slotIdx };
            });
        });
        return locations;
    }, [roomData, players]);
    
    const inProgressPlayerIds = useMemo(() => new Set(
        (roomData?.inProgressCourts || [])
        .filter(c => c && c.players).flatMap(c => c.players).filter(Boolean)
    ), [roomData]);
    
    // 대기 명단 선수 정렬
    const { maleWaitingPlayers, femaleWaitingPlayers } = useMemo(() => {
        const waiting = Object.values(players)
            .filter(p => playerLocations[p.id]?.location === 'waiting')
            .sort((a, b) => (LEVEL_ORDER[a.level] || 99) - (LEVEL_ORDER[b.level] || 99) || a.name.localeCompare(b.name));
        return {
            maleWaitingPlayers: waiting.filter(p => p.gender === '남'),
            femaleWaitingPlayers: waiting.filter(p => p.gender === '여'),
        };
    }, [players, playerLocations]);

    // 핸들러 함수들
    const handleCardClick = useCallback((playerId) => {
        if (!isAdmin) return;
        setSelectedPlayerIds(ids => ids.includes(playerId) ? ids.filter(id => id !== playerId) : [...ids, playerId]);
    }, [isAdmin]);

    const handleSlotClick = useCallback(async (context) => {
        if (!isAdmin || selectedPlayerIds.length === 0) return;
        
        await updateRoomData(currentData => {
            const newData = JSON.parse(JSON.stringify(currentData));
            const playersToMove = [...selectedPlayerIds];
            let targetArray = newData.scheduledMatches[context.matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);

            for (let i = 0; i < PLAYERS_PER_MATCH && playersToMove.length > 0; i++) {
                if (targetArray[i] === null) targetArray[i] = playersToMove.shift();
            }
            newData.scheduledMatches[context.matchIndex] = targetArray;
            return newData;
        });
        setSelectedPlayerIds([]);
    }, [isAdmin, selectedPlayerIds, updateRoomData]);

    const handleReturnToWaiting = useCallback(async (player) => {
        const loc = playerLocations[player.id];
        if (!loc || loc.location !== 'schedule') return;

        await updateRoomData(currentData => {
            const newData = JSON.parse(JSON.stringify(currentData));
            newData.scheduledMatches[loc.matchIndex][loc.slotIndex] = null;
            return newData;
        });
    }, [playerLocations, updateRoomData]);

    const handleStartMatch = useCallback(async (matchIndex) => {
        const match = roomData?.scheduledMatches?.[matchIndex] || [];
        if (match.filter(p => p).length !== PLAYERS_PER_MATCH) return;
        if (match.some(pId => inProgressPlayerIds.has(pId))) {
            setModal({ type: 'alert', data: { title: '시작 불가', body: '선수가 이미 다른 경기에 참여중입니다.' } });
            return;
        }

        const emptyCourts = Array.from({ length: roomData.numInProgressCourts }, (_, i) => i)
                                 .filter(i => !roomData.inProgressCourts[i]);
        if (emptyCourts.length === 0) {
            setModal({ type: 'alert', data: { title: "시작 불가", body: "빈 코트가 없습니다." } });
            return;
        }

        const start = async (courtIndex) => {
            await updateRoomData(currentData => {
                const newData = JSON.parse(JSON.stringify(currentData));
                newData.inProgressCourts[courtIndex] = { players: match, startTime: new Date().toISOString() };
                for (let i = matchIndex; i < newData.numScheduledMatches - 1; i++) {
                    newData.scheduledMatches[i] = newData.scheduledMatches[i + 1] || Array(PLAYERS_PER_MATCH).fill(null);
                }
                newData.scheduledMatches[newData.numScheduledMatches - 1] = Array(PLAYERS_PER_MATCH).fill(null);
                return newData;
            });
            setModal({type: null, data: null});
        };

        if (emptyCourts.length === 1) start(emptyCourts[0]);
        else setModal({ type: 'courtSelection', data: { courts: emptyCourts, onSelect: start } });
    }, [roomData, inProgressPlayerIds, updateRoomData]);

    const handleEndMatch = useCallback(async (courtIndex) => {
        const court = roomData?.inProgressCourts?.[courtIndex];
        if (!court || court.players.some(p => !p)) return;

        const matchPlayers = court.players.map(pId => players[pId]).filter(Boolean);
        if (matchPlayers.length !== PLAYERS_PER_MATCH) return;
        
        setModal({ type: 'resultInput', data: { courtIndex, players: matchPlayers, onResultSubmit: processMatchResult }});
    }, [roomData, players]);
    
    const processMatchResult = useCallback(async (courtIndex, winningTeamIds) => {
        const court = roomData.inProgressCourts[courtIndex];
        const batch = writeBatch(db);
        
        court.players.forEach(pId => {
            const playerDocRef = doc(db, 'rooms', roomId, 'players', pId);
            const player = players[pId];
            const isWinner = winningTeamIds.includes(pId);
            const updatedData = {
                todayWins: (player.todayWins || 0) + (isWinner ? 1 : 0),
                todayLosses: (player.todayLosses || 0) + (isWinner ? 0 : 1),
            };
            batch.update(playerDocRef, updatedData);
        });
        
        await batch.commit();
        
        await updateRoomData(currentData => {
            const newData = JSON.parse(JSON.stringify(currentData));
            newData.inProgressCourts[courtIndex] = null;
            return newData;
        });
        setModal({type: null, data: null});
    }, [roomData, players, roomId, updateRoomData]);

    const handleExitRoom = async () => {
        await deleteDoc(doc(db, 'rooms', roomId, 'players', userData.uid));
        setPage('lobby');
    };
    
    if (!roomData) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400 arcade-font">LOADING ROOM...</div></div>;
    }

    const { numScheduledMatches, scheduledMatches, numInProgressCourts, inProgressCourts } = roomData;

    const renderMainContent = () => (
        <>
            <section className="bg-gray-800/50 rounded-lg p-2">
                <h2 className="text-sm font-bold mb-2 text-yellow-400 arcade-font flicker-text">대기 명단 ({maleWaitingPlayers.length + femaleWaitingPlayers.length})</h2>
                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-5 gap-1">{maleWaitingPlayers.map(p => <PlayerCard key={p.id} player={p} context={{ location: null, selected: selectedPlayerIds.includes(p.id) }} isAdmin={isAdmin} onCardClick={() => handleCardClick(p.id)} isCurrentUser={userData.uid === p.id} isPlaying={inProgressPlayerIds.has(p.id)} />)}</div>
                    {maleWaitingPlayers.length > 0 && femaleWaitingPlayers.length > 0 && <hr className="border-dashed border-gray-600 my-1" />}
                    <div className="grid grid-cols-5 gap-1">{femaleWaitingPlayers.map(p => <PlayerCard key={p.id} player={p} context={{ location: null, selected: selectedPlayerIds.includes(p.id) }} isAdmin={isAdmin} onCardClick={() => handleCardClick(p.id)} isCurrentUser={userData.uid === p.id} isPlaying={inProgressPlayerIds.has(p.id)} />)}</div>
                </div>
            </section>
            <section>
                <h2 className="text-lg font-bold text-cyan-400 arcade-font mb-2 px-1">경기 예정</h2>
                <div className="flex flex-col gap-2">
                    {Array.from({ length: numScheduledMatches }).map((_, matchIndex) => {
                        const match = scheduledMatches?.[matchIndex] || Array(PLAYERS_PER_MATCH).fill(null);
                        const playerCount = match.filter(p => p).length;
                        return (
                            <div key={`schedule-${matchIndex}`} className="flex items-center w-full bg-gray-800/60 rounded-lg p-1 gap-1">
                                <p className="flex-shrink-0 w-6 text-center font-bold text-lg text-white arcade-font">{matchIndex + 1}</p>
                                <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                    {Array(PLAYERS_PER_MATCH).fill(null).map((_, slotIndex) => {
                                        const pId = match[slotIndex];
                                        return pId ? <PlayerCard key={pId} player={players[pId]} context={{location: 'schedule', matchIndex, slotIndex, selected: selectedPlayerIds.includes(pId)}} isAdmin={isAdmin} onCardClick={() => handleCardClick(pId)} onAction={handleReturnToWaiting} isCurrentUser={userData.uid === pId} isPlaying={inProgressPlayerIds.has(pId)} /> : <EmptySlot key={`s-empty-${matchIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick({ matchIndex, slotIndex })} />
                                    })}
                                </div>
                                <div className="flex-shrink-0 w-14 text-center">
                                    <button className={`arcade-button w-full py-1.5 px-1 rounded-md font-bold transition duration-300 text-[10px] ${playerCount === PLAYERS_PER_MATCH && isAdmin ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={playerCount !== PLAYERS_PER_MATCH || !isAdmin} onClick={() => handleStartMatch(matchIndex)}>START</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
            <section>
                <h2 className="text-lg font-bold mb-2 text-red-500 px-1 arcade-font">경기 진행</h2>
                <div className="flex flex-col gap-2">
                    {Array.from({ length: numInProgressCourts }).map((_, courtIndex) => {
                        const court = inProgressCourts?.[courtIndex];
                        return (
                             <div key={`court-${courtIndex}`} className="flex items-center w-full bg-gray-800/60 rounded-lg p-1 gap-1">
                                <div className="flex-shrink-0 w-6 flex flex-col items-center justify-center">
                                    <p className="font-bold text-lg text-white arcade-font">{courtIndex + 1}</p>
                                    <p className="font-semibold text-[8px] text-gray-400 arcade-font">코트</p>
                                </div>
                                <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                    {(court?.players || Array(PLAYERS_PER_MATCH).fill(null)).map((pId, slotIndex) => (
                                        pId ? <PlayerCard key={pId} player={players[pId]} context={{ location: 'court' }} isAdmin={isAdmin} isCurrentUser={userData.uid === pId} isMovable={false} /> : <EmptySlot key={`c-empty-${courtIndex}-${slotIndex}`} />
                                    ))}
                                </div>
                                <div className="flex-shrink-0 w-14 text-center">
                                    <button className={`arcade-button w-full py-1.5 px-1 rounded-md font-bold transition duration-300 text-[10px] ${court && isAdmin ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={!court || !isAdmin} onClick={(e) => { e.stopPropagation(); handleEndMatch(courtIndex); }}>FINISH</button>
                                    <CourtTimer court={court} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            </section>
        </>
    );

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
            {modal?.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({ type: null, data: null })} />}
            {modal?.type === 'confirm' && <ConfirmationModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
            {modal?.type === 'courtSelection' && <CourtSelectionModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
            {modal?.type === 'resultInput' && <ResultInputModal {...modal.data} onClose={() => setModal({ type: null, data: null })} />}

            <header className="flex-shrink-0 p-3 flex items-center justify-between gap-2 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-700">
                <h1 className="text-lg font-bold text-yellow-400 arcade-font flicker-text">{roomData.name}</h1>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold whitespace-nowrap">{isAdmin ? '👑' : ''} {userData.name}</span>
                    <button onClick={handleExitRoom} className="arcade-button bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs">나가기</button>
                </div>
            </header>

            <main className="flex-grow flex flex-col gap-3 p-1.5 overflow-y-auto">
                {isMobile ? (
                    <>
                        <div className="flex-shrink-0 flex justify-around border-b border-gray-700 mb-2 sticky top-0 bg-black z-10">
                            <button onClick={() => setActiveTab('matching')} className={`py-2 px-4 font-bold ${activeTab === 'matching' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}>매칭</button>
                            <button onClick={() => setActiveTab('inProgress')} className={`py-2 px-4 font-bold ${activeTab === 'inProgress' ? 'text-yellow-400 border-b-2 border-yellow-400' : 'text-gray-400'}`}>진행</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {activeTab === 'matching' && renderMainContent()}
                            {activeTab === 'inProgress' && <section>...경기 진행 섹션만 표시...</section>}
                        </div>
                    </>
                ) : renderMainContent()}
            </main>
            <style>{`
                body, .player-card, div, button, span, h1, h2 { user-select: none; }
                .arcade-font { font-family: 'Press Start 2P', cursive; }
                .arcade-button { position: relative; border: 2px solid #222; box-shadow: inset -2px -2px 0px 0px #333, inset 2px 2px 0px 0px #FFF; white-space: nowrap; }
                .arcade-button:active { transform: translateY(2px); box-shadow: inset -1px -1px 0px 0px #333, inset 1px 1px 0px 0px #FFF; }
                @keyframes flicker { 0%, 100% { opacity: 1; text-shadow: 0 0 8px #FFD700; } 50% { opacity: 0.8; text-shadow: 0 0 12px #FFD700; } }
                .flicker-text { animation: flicker 1.5s infinite; }
            `}</style>
        </div>
    );
}


// ===================================================================================
// 기존 콕스타 페이지 (Auth, Lobby, Profile)
// ===================================================================================

function AuthPage({ setPage }) {
    const [step, setStep] = useState(1); // 1: phone, 2: code, 3: info, 4: login
    const [formData, setFormData] = useState({ username: '', name: '', phone: '', level: 'A조', gender: '남' });
    const [verificationId, setVerificationId] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [error, setError] = useState('');
    const recaptchaVerifierRef = useRef(null);

    useEffect(() => {
        if (!recaptchaVerifierRef.current) {
            recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible',
                'callback': (response) => { console.log("reCAPTCHA solved"); },
                'expired-callback': () => { console.log("reCAPTCHA expired"); }
            });
        }
    }, []);
    
    const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("phone", "==", formData.phone));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                setError('이미 가입된 전화번호입니다.');
                return;
            }
            const verifier = recaptchaVerifierRef.current;
            const confirmationResult = await signInWithPhoneNumber(auth, `+82${formData.phone.substring(1)}`, verifier);
            setVerificationId(confirmationResult.verificationId);
            setStep(2);
        } catch (err) {
            setError(`인증번호 발송 실패: ${err.message}`);
            console.error(err);
        }
    };

    const handleCodeSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await verificationId.confirm(verificationCode);
            setStep(3);
        } catch (err) {
             setError('인증번호가 잘못되었습니다.');
        }
    };
    
    const handleSignUp = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", formData.username));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                setError('이미 사용중인 아이디입니다.');
                return;
            }

            const email = `${formData.username}@cockstar.app`;
            const password = Math.random().toString(36).slice(-8); // 임시 비밀번호
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                username: formData.username,
                name: formData.name,
                phone: formData.phone,
                level: formData.level,
                gender: formData.gender,
            });
            alert(`가입 완료! 임시 비밀번호: ${password}\n로그인 후 프로필에서 변경 가능합니다.`);
            setStep(4);
        } catch (err) {
            setError(`가입 실패: ${err.message}`);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const email = `${formData.username}@cockstar.app`;
            await signInWithEmailAndPassword(auth, email, formData.password);
            // onAuthStateChanged가 페이지 전환을 처리
        } catch (err) {
            setError('아이디 또는 비밀번호가 잘못되었습니다.');
        }
    };

    const renderStep = () => {
        switch(step) {
            case 1: return (
                <form onSubmit={handlePhoneSubmit} className="space-y-4">
                    <h2 className="text-xl font-bold text-center">전화번호 인증</h2>
                    <input type="tel" name="phone" placeholder="전화번호 ('-' 제외)" value={formData.phone} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg" required />
                    <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">인증번호 받기</button>
                    <button type="button" onClick={() => setStep(4)} className="w-full text-center text-sm text-gray-400 mt-2">이미 계정이 있으신가요? 로그인</button>
                </form>
            );
            case 2: return (
                <form onSubmit={handleCodeSubmit} className="space-y-4">
                     <h2 className="text-xl font-bold text-center">인증번호 입력</h2>
                    <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} placeholder="인증번호 6자리" className="w-full bg-gray-700 text-white p-3 rounded-lg" required />
                    <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">확인</button>
                </form>
            );
            case 3: return (
                 <form onSubmit={handleSignUp} className="space-y-4">
                     <h2 className="text-xl font-bold text-center">회원 정보 입력</h2>
                    <input type="text" name="username" placeholder="아이디" value={formData.username} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                    <input type="text" name="name" placeholder="닉네임" value={formData.name} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                    <select name="level" value={formData.level} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>A조</option><option>B조</option><option>C조</option><option>D조</option></select>
                    <select name="gender" value={formData.gender} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg"><option>남</option><option>여</option></select>
                    <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">가입 완료하기</button>
                </form>
            );
            case 4: return (
                 <form onSubmit={handleLogin} className="space-y-4">
                    <h2 className="text-xl font-bold text-center">로그인</h2>
                    <input type="text" name="username" placeholder="아이디" value={formData.username} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                    <input type="password" name="password" placeholder="비밀번호" value={formData.password} onChange={handleChange} required className="w-full bg-gray-700 text-white p-3 rounded-lg" />
                    <button type="submit" className="w-full arcade-button bg-yellow-500 text-black font-bold py-3 rounded-lg">로그인</button>
                     <button type="button" onClick={() => setStep(1)} className="w-full text-center text-sm text-gray-400 mt-2">계정이 없으신가요? 회원가입</button>
                </form>
            );
            default: return null;
        }
    }

    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div id="recaptcha-container"></div>
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center arcade-font flicker-text">콕스타</h1>
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                {renderStep()}
            </div>
        </div>
    );
}

function LobbyPage({ userData, setPage, setRoomId }) {
    const [rooms, setRooms] = useState([]);
    const [newRoomName, setNewRoomName] = useState('');

    useEffect(() => {
        const roomsRef = collection(db, "rooms");
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
        if (!newRoomName.trim()) return;
        const roomRef = await addDoc(collection(db, "rooms"), {
            name: newRoomName,
            createdAt: new Date(),
            numScheduledMatches: 4,
            numInProgressCourts: 4,
            scheduledMatches: {},
            inProgressCourts: Array(4).fill(null)
        });
        setNewRoomName('');
        handleEnterRoom(roomRef.id);
    };

    const handleEnterRoom = async (roomId) => {
        const playerDocRef = doc(db, 'rooms', roomId, 'players', userData.uid);
        await setDoc(playerDocRef, { ...userData, todayWins: 0, todayLosses: 0 });
        setRoomId(roomId);
        setPage('room');
    };
    
    const handleLogout = () => signOut(auth);

    return (
        <div className="bg-black text-white min-h-screen flex flex-col items-center p-4">
            <header className="w-full max-w-lg flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold arcade-font flicker-text text-yellow-400">로비</h1>
                <div>
                    <span className="mr-4">환영합니다, {userData.name}님!</span>
                    <button onClick={handleLogout} className="arcade-button bg-red-600 text-white py-1 px-3 text-sm rounded-md">로그아웃</button>
                </div>
            </header>

            <div className="w-full max-w-lg bg-gray-800 p-4 rounded-lg">
                <div className="flex gap-2 mb-4">
                    <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="새 방 이름" className="flex-grow bg-gray-700 p-2 rounded-lg" />
                    <button onClick={handleCreateRoom} className="arcade-button bg-yellow-500 text-black font-bold px-4 rounded-lg">방 만들기</button>
                </div>
                <div className="space-y-2">
                    {rooms.map(room => (
                        <div key={room.id} className="flex justify-between items-center bg-gray-700 p-3 rounded-lg">
                            <span className="font-semibold">{room.name}</span>
                            <button onClick={() => handleEnterRoom(room.id)} className="arcade-button bg-green-500 text-black font-bold px-4 py-1 text-sm rounded-lg">입장</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ProfilePage({ userData, setPage }) { /* ... 간단한 프로필 페이지 ... */ }

// ===================================================================================
// 메인 앱 컴포넌트
// ===================================================================================
export default function App() {
    const [page, setPage] = useState('lobby');
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [roomId, setRoomId] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    setUserData({ uid: currentUser.uid, ...docSnap.data() });
                    setUser(currentUser);
                    setPage(prevPage => prevPage === 'auth' ? 'lobby' : prevPage);
                } else {
                    signOut(auth); // Firestore에 데이터가 없으면 로그아웃
                }
            } else {
                setUser(null);
                setUserData(null);
                setPage('auth');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center"><p className="arcade-font text-yellow-400">LOADING...</p></div>;
    }

    if (!user) {
        return <AuthPage setPage={setPage} />;
    }

    switch (page) {
        case 'lobby':
            return <LobbyPage userData={userData} setPage={setPage} setRoomId={setRoomId} />;
        case 'room':
            return <GameRoomPage userData={userData} roomId={roomId} setPage={setPage} />;
        case 'profile':
            return <ProfilePage userData={userData} setPage={setPage} />;
        default:
            return <LobbyPage userData={userData} setPage={setPage} setRoomId={setRoomId} />;
    }
}
