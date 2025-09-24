import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, doc, getDoc, setDoc, onSnapshot, 
    collection, deleteDoc, updateDoc, writeBatch, runTransaction 
} from 'firebase/firestore';

// ===================================================================================
// Firebase 설정
// ===================================================================================
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const playersRef = collection(db, "players");
const gameStateRef = doc(db, "gameState", "live");

// ===================================================================================
// 상수 정의
// ===================================================================================
const ADMIN_NAMES = ["나채빈", "정형진", "윤지혜", "이상민", "이정문", "신영은", "오미리"];
const PLAYERS_PER_MATCH = 4;

// ===================================================================================
// Helper 함수
// ===================================================================================
const generateId = (name) => name.replace(/\s+/g, '_');

const getLevelColor = (level, isGuest) => {
    if (isGuest) return '#00BFFF';
    switch (level) {
        case 'A조': return '#FF1744';
        case 'B조': return '#FF9100';
        case 'C조': return '#FFD600';
        case 'D조': return '#00E676';
        default: return '#A1A1AA';
    }
};

const calculateLocations = (gameState, players) => {
    const locations = {};
    Object.keys(players).forEach(pId => locations[pId] = { location: 'waiting' });

    if (gameState.scheduledMatches) {
        Object.keys(gameState.scheduledMatches).forEach(matchKey => {
            const match = gameState.scheduledMatches[matchKey];
            if (match) {
                match.forEach((playerId, slotIndex) => {
                    if (playerId) locations[playerId] = { location: 'schedule', matchIndex: parseInt(matchKey), slotIndex: slotIndex };
                });
            }
        });
    }

    if (gameState.inProgressCourts) {
        gameState.inProgressCourts.forEach((court, courtIndex) => {
            if (court && court.players) {
                court.players.forEach((playerId, slotIndex) => {
                    if (playerId) locations[playerId] = { location: 'court', matchIndex: courtIndex, slotIndex: slotIndex };
                });
            }
        });
    }
    return locations;
};

// ===================================================================================
// 자식 컴포넌트들
// ===================================================================================
const PlayerCard = React.memo(({ player, context, isAdmin, onCardClick, onAction, onLongPress, isCurrentUser }) => {
    let pressTimer = null;
    const handleMouseDown = (e) => { e.preventDefault(); pressTimer = setTimeout(() => onLongPress(player), 1000); };
    const handleMouseUp = () => { clearTimeout(pressTimer); };
    const handleContextMenu = (e) => { e.preventDefault(); };
    
    const genderStyle = {
        boxShadow: `inset 3px 0 0 0 ${player.gender === '남' ? '#3B82F6' : '#EC4899'}`
    };

    const adminIcon = (player.role === 'admin' || ADMIN_NAMES.includes(player.name)) ? '👑' : '';
    const isWaiting = !context.location;
    const buttonHoverColor = isWaiting ? 'hover:text-red-500' : 'hover:text-yellow-400';
    const buttonIcon = "fas fa-times-circle fa-xs";
    const playerNameClass = `player-name text-white text-[11px] font-bold whitespace-nowrap leading-tight`;
    const playerInfoClass = `player-info text-gray-400 text-[10px] leading-tight mt-px whitespace-nowrap`;
    
    const levelColor = getLevelColor(player.level, player.isGuest);
    
    const levelStyle = {
        color: levelColor,
        fontWeight: 'bold',
        fontSize: '14px',
    };

    const cardStyle = {
        borderColor: context.selected ? '#FBBF24' : 'transparent',
        ...genderStyle,
    };

    if (isCurrentUser) {
        cardStyle.boxShadow = `${cardStyle.boxShadow}, 0 0 12px 4px rgba(251, 191, 36, 0.9)`;
    }

    return (
        <div 
            className={`player-card bg-gray-700 p-1 rounded-md cursor-pointer border-2 relative flex flex-col justify-center text-center h-14 transition-all duration-300 ${player.isResting ? 'filter grayscale' : ''}`}
            style={cardStyle}
            onClick={() => onCardClick(player.id)}
            onMouseDown={isAdmin ? handleMouseDown : null}
            onMouseUp={isAdmin ? handleMouseUp : null}
            onTouchStart={isAdmin ? handleMouseDown : null}
            onTouchEnd={isAdmin ? handleMouseUp : null}
            onMouseLeave={isAdmin ? handleMouseUp : null}
            onContextMenu={isAdmin ? handleContextMenu : null}
        >
            <div>
                <div className={playerNameClass}>{adminIcon}{player.name}</div>
                <div className={playerInfoClass}>
                    <span style={levelStyle}>{player.level.replace('조','')}</span>|
                    {player.gamesPlayed}겜
                </div>
            </div>
            {isAdmin && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onAction(player); }} 
                    className={`absolute -top-2 -right-2 p-1 text-gray-500 ${buttonHoverColor}`}
                    aria-label={isWaiting ? '선수 삭제' : '대기자로 이동'}
                ><i className={buttonIcon}></i></button>
            )}
        </div>
    );
});

const EmptySlot = ({ onSlotClick }) => ( 
    <div 
        className="player-slot h-14 bg-gray-900/50 rounded-md flex items-center justify-center text-gray-500 border-2 border-dashed border-gray-600 cursor-pointer"
        onClick={onSlotClick}
    >
        <span className="text-lg">+</span>
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
    return <div className="text-center text-sm font-mono text-white mt-1">{time}</div>;
};

// ===================================================================================
// UI Section Components
// ===================================================================================
const WaitingListSection = React.memo(({ maleWaitingPlayers, femaleWaitingPlayers, selectedPlayerIds, isAdmin, handleCardClick, handleDeleteFromWaiting, setModal, currentUser }) => {
    return (
        <section className="flex-shrink-0 bg-gray-800/50 rounded-lg p-2">
            <h2 className="text-sm font-bold mb-2 text-yellow-400">대기자 명단 ({maleWaitingPlayers.length + femaleWaitingPlayers.length})</h2>
            {maleWaitingPlayers.length > 0 && (
                <div id="male-waiting-list" className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {maleWaitingPlayers.map(player => ( <PlayerCard key={player.id} player={player} context={{ location: null, selected: selectedPlayerIds.includes(player.id) }} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleDeleteFromWaiting} onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})} isCurrentUser={currentUser && player.id === currentUser.id}/> ))}
                </div>
            )}
            {maleWaitingPlayers.length > 0 && femaleWaitingPlayers.length > 0 && (
                <div className="my-2 border-t-2 border-dashed border-gray-600"></div>
            )}
            {femaleWaitingPlayers.length > 0 && (
                <div id="female-waiting-list" className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                    {femaleWaitingPlayers.map(player => ( <PlayerCard key={player.id} player={player} context={{ location: null, selected: selectedPlayerIds.includes(player.id) }} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleDeleteFromWaiting} onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})} isCurrentUser={currentUser && player.id === currentUser.id}/> ))}
                </div>
            )}
        </section>
    );
});

const ScheduledMatchesSection = React.memo(({ numScheduledMatches, scheduledMatches, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleStartMatch, currentUser }) => {
    return (
        <section>
            <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 예정</h2>
            <div id="scheduled-matches" className="flex flex-col gap-2">
                {Array.from({ length: numScheduledMatches }).map((_, matchIndex) => {
                    const match = scheduledMatches[String(matchIndex)] || Array(PLAYERS_PER_MATCH).fill(null);
                    const playerCount = match.filter(p => p).length;
                    return (
                        <div key={`schedule-${matchIndex}`} className="flex items-center w-full bg-gray-800 rounded-lg p-1 gap-1">
                            <div className="flex-shrink-0 w-12 text-center">
                                <p className="font-semibold text-[10px] text-gray-400">예정</p>
                                <p className="font-bold text-base text-white">{matchIndex + 1}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                {Array(PLAYERS_PER_MATCH).fill(null).map((_, slotIndex) => {
                                    const playerId = match[slotIndex];
                                    const player = players[playerId];
                                    const context = {location: 'schedule', matchIndex, slotIndex, selected: selectedPlayerIds.includes(playerId)};
                                    return player ? ( <PlayerCard key={playerId} player={player} context={context} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleReturnToWaiting} onLongPress={(p) => setModal({type: 'editGames', data: { player: p }})} isCurrentUser={currentUser && player.id === currentUser.id} /> ) : ( <EmptySlot key={`schedule-empty-${matchIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick({ location: 'schedule', matchIndex, slotIndex })} /> )
                                })}
                            </div>
                            <div className="flex-shrink-0 w-14 text-center">
                                <button className={`w-full py-2 px-1 rounded-md font-semibold transition duration-300 text-[10px] ${playerCount === PLAYERS_PER_MATCH && isAdmin ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={playerCount !== PLAYERS_PER_MATCH || !isAdmin} onClick={() => handleStartMatch(matchIndex)}>경기 시작</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
});

const InProgressCourtsSection = React.memo(({ numInProgressCourts, inProgressCourts, players, selectedPlayerIds, isAdmin, handleCardClick, handleReturnToWaiting, setModal, handleSlotClick, handleEndMatch, currentUser }) => {
    return (
        <section>
            <h2 className="text-sm font-bold mb-2 text-yellow-400 px-1">경기 진행 코트</h2>
            <div id="in-progress-courts" className="flex flex-col gap-2">
                {Array.from({ length: numInProgressCourts }).map((_, courtIndex) => {
                    const court = inProgressCourts[courtIndex];
                    return (
                        <div key={`court-${courtIndex}`} className="flex items-center w-full bg-gray-800 rounded-lg p-1 gap-1">
                            <div className="flex-shrink-0 w-12 text-center">
                                <p className="font-bold text-base text-white">{courtIndex + 1}</p>
                                <p className="font-semibold text-[10px] text-gray-400">코트</p>
                            </div>
                            <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
                                {(court?.players || Array(PLAYERS_PER_MATCH).fill(null)).map((playerId, slotIndex) => {
                                    const player = players[playerId];
                                    const context = { location: 'court', matchIndex: courtIndex, selected: selectedPlayerIds.includes(playerId) };
                                    return player ? ( <PlayerCard key={playerId} player={player} context={context} isAdmin={isAdmin} onCardClick={handleCardClick} onAction={handleReturnToWaiting} onLongPress={() => setModal({type: 'moveCourt', data: { sourceCourtIndex: courtIndex }})} isCurrentUser={currentUser && player.id === currentUser.id} /> ) : ( <EmptySlot key={`court-empty-${courtIndex}-${slotIndex}`} onSlotClick={() => handleSlotClick({ location: 'court', courtIndex, slotIndex })} /> )
                                })}
                            </div>
                            <div className="flex-shrink-0 w-14 text-center">
                                <button className={`w-full py-2 px-1 rounded-md font-semibold transition duration-300 text-[10px] ${court && isAdmin ? 'bg-white hover:bg-gray-200 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`} disabled={!court || !isAdmin} onClick={() => handleEndMatch(courtIndex)}>경기 종료</button>
                                <CourtTimer court={court} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
});

// ===================================================================================
// Main App Component
// ===================================================================================
export default function App() {
    const [players, setPlayers] = useState({});
    const [gameState, setGameState] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
    const [modal, setModal] = useState({ type: null, data: null });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);

    const isAdmin = useMemo(() => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return ADMIN_NAMES.includes(currentUser.name);
    }, [currentUser]);

    useEffect(() => {
        const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
            const playersData = {};
            snapshot.forEach(doc => playersData[doc.id] = doc.data());
            setPlayers(playersData);
        });
        
        const unsubscribeGameState = onSnapshot(gameStateRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.numScheduledMatches !== undefined && data.numInProgressCourts !== undefined) {
                    const scheduledCount = data.numScheduledMatches;
                    const inProgressCount = data.numInProgressCourts;
                    const currentInProgress = data.inProgressCourts || [];

                    setGameState({
                        scheduledMatches: data.scheduledMatches || {},
                        inProgressCourts: Array(inProgressCount).fill(null).map((_, i) => currentInProgress[i] || null),
                        numScheduledMatches: scheduledCount,
                        numInProgressCourts: inProgressCount,
                    });
                }
            } else {
                const initialState = { 
                    scheduledMatches: {}, 
                    inProgressCourts: Array(4).fill(null),
                    numScheduledMatches: 4,
                    numInProgressCourts: 4,
                };
                setDoc(gameStateRef, initialState).then(() => {
                    setGameState(initialState);
                });
            }
        });
        return () => { unsubscribePlayers(); unsubscribeGameState(); };
    }, []);
    
    useEffect(() => {
        const savedUserId = localStorage.getItem('badminton-currentUser-id');
        if (savedUserId) {
            getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) { 
                    setCurrentUser(docSnap.data()); 
                } else { 
                    localStorage.removeItem('badminton-currentUser-id'); 
                }
            }).finally(() => {
                setAuthChecked(true);
            });
        } else {
            setAuthChecked(true);
        }
    }, []);

    useEffect(() => {
        if (currentUser && players[currentUser.id]) {
            if (currentUser.isResting !== players[currentUser.id].isResting) {
                setCurrentUser(players[currentUser.id]);
            }
        }
    }, [players, currentUser]);
    
    const updateGameState = useCallback(async (updateFunction, customErrorMessage) => {
        try {
            await runTransaction(db, async (transaction) => {
                const playerDocs = {};
                const playerIdsToRead = updateFunction.playerIdsToUpdate || [];
                for (const pid of playerIdsToRead) {
                    playerDocs[pid] = await transaction.get(doc(playersRef, pid));
                }

                const gameStateDoc = await transaction.get(gameStateRef);
                if (!gameStateDoc.exists()) throw new Error("Game state document does not exist!");
                
                const currentState = gameStateDoc.data();
                const { newState, playerUpdates } = updateFunction(currentState, playerDocs);
                
                transaction.set(gameStateRef, newState);
                if (playerUpdates) {
                    playerUpdates.forEach(({ id, changes }) => {
                        transaction.update(doc(playersRef, id), changes);
                    });
                }
            });
        } catch (err) {
            console.error("Transaction failed: ", err);
            throw new Error(customErrorMessage || err.message);
        }
    }, []);

    const playerLocations = useMemo(() => {
        if (!gameState) return {};
        return calculateLocations(gameState, players);
    }, [gameState, players]);

    const findPlayerLocation = useCallback((playerId) => playerLocations[playerId] || { location: 'waiting' }, [playerLocations]);
    
    const handleReturnToWaiting = useCallback(async (player) => {
        const loc = findPlayerLocation(player.id);
        if (!loc || loc.location === 'waiting') return;

        const updateFunction = (currentState) => {
            const newState = JSON.parse(JSON.stringify(currentState));
            if (loc.location === 'schedule') {
                newState.scheduledMatches[String(loc.matchIndex)][loc.slotIndex] = null;
            } else if (loc.location === 'court') {
                newState.inProgressCourts[loc.matchIndex].players[loc.slotIndex] = null;
                if (newState.inProgressCourts[loc.matchIndex].players.every(p => p === null)) {
                    newState.inProgressCourts[loc.matchIndex] = null;
                }
            }
            return { newState };
        };
        
        try {
            await updateGameState(updateFunction, '다른 관리자와 작업이 충돌했습니다.');
        } catch (error) {
            setModal({ type: 'alert', data: { title: '업데이트 충돌', body: error.message }});
        }
    }, [findPlayerLocation, updateGameState]);
    
    const handleDeleteFromWaiting = useCallback((player) => {
        setModal({ type: 'confirm', data: { title: '선수 내보내기', body: `${player.name} 선수를 내보낼까요?`,
            onConfirm: async () => { 
                await deleteDoc(doc(playersRef, player.id)).catch(error => {
                    setModal({ type: 'alert', data: { title: '오류', body: '선수 삭제에 실패했습니다.' }});
                });
                setModal({ type: null, data: null });
            }
        }});
    }, []);

    const handleEnter = useCallback(async (formData) => {
        const { name, level, gender, isGuest } = formData;
        if (!name) { setModal({ type: 'alert', data: { title: '오류', body: '이름을 입력해주세요.' } }); return; }
        const id = generateId(name);
        try {
            const playerDocRef = doc(playersRef, id);
            let docSnap = await getDoc(playerDocRef);
            let playerData = docSnap.exists() 
                ? { ...docSnap.data(), level, gender, isGuest }
                : { id, name, level, gender, isGuest, gamesPlayed: 0, entryTime: new Date().toISOString(), isResting: false };
            
            await setDoc(playerDocRef, playerData, { merge: true });
            setCurrentUser(playerData);
            localStorage.setItem('badminton-currentUser-id', id);
        } catch (error) {
            setModal({ type: 'alert', data: { title: '오류', body: '입장 처리 중 문제가 발생했습니다.' }});
        }
    }, []);

    const handleLogout = useCallback(() => {
        if (!currentUser) return;
        setModal({ type: 'confirm', data: { 
            title: '나가기', 
            body: '나가시면 대기 명단과 경기에서 완전히 제외됩니다. 정말 나가시겠습니까?',
            onConfirm: async () => {
                try {
                    const updateFunction = (currentState) => {
                        const newState = JSON.parse(JSON.stringify(currentState));
                        const playerId = currentUser.id;
                        Object.keys(newState.scheduledMatches).forEach(matchKey => {
                            const match = newState.scheduledMatches[matchKey];
                            const playerIndex = match.indexOf(playerId);
                            if (playerIndex > -1) match[playerIndex] = null;
                        });
                        newState.inProgressCourts.forEach((court, courtIndex) => {
                            if (court?.players) {
                                const playerIndex = court.players.indexOf(playerId);
                                if (playerIndex > -1) court.players[playerIndex] = null;
                                if (court.players.every(p => p === null)) newState.inProgressCourts[courtIndex] = null;
                            }
                        });
                        return { newState };
                    };
                    await updateGameState(updateFunction);
                    await deleteDoc(doc(playersRef, currentUser.id));
                    
                    localStorage.removeItem('badminton-currentUser-id');
                    setCurrentUser(null);
                    setModal({ type: null, data: null });
                } catch (error) {
                    setModal({ type: 'alert', data: { title: '오류', body: '나가는 도중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요.' }});
                }
            }
        }});
    }, [currentUser, updateGameState]);
    
    const handleCardClick = useCallback(async (playerId) => {
        if (!isAdmin) return;
        const loc = findPlayerLocation(playerId);
        const firstSelectedId = selectedPlayerIds.length > 0 ? selectedPlayerIds[0] : null;
        const firstSelectedLoc = firstSelectedId ? findPlayerLocation(firstSelectedId) : null;

        if (loc.location === 'waiting') {
            if (!firstSelectedLoc || firstSelectedLoc.location === 'waiting') {
                setSelectedPlayerIds(ids => ids.includes(playerId) ? ids.filter(id => id !== playerId) : [...ids, playerId]);
            } else { setSelectedPlayerIds([playerId]); }
        } else {
            if (!firstSelectedId) { setSelectedPlayerIds([playerId]); }
            else if (selectedPlayerIds.length === 1 && firstSelectedLoc.location !== 'waiting') {
                const updateFunction = (currentState) => {
                    const newState = JSON.parse(JSON.stringify(currentState));
                    const getValue = (l) => l.location === 'schedule' ? newState.scheduledMatches[String(l.matchIndex)][l.slotIndex] : newState.inProgressCourts[l.matchIndex].players[l.slotIndex];
                    const setValue = (l, value) => {
                        if (l.location === 'schedule') newState.scheduledMatches[String(l.matchIndex)][l.slotIndex] = value;
                        else if(l.location === 'court') newState.inProgressCourts[l.matchIndex].players[l.slotIndex] = value;
                    };
                    const valA = getValue(firstSelectedLoc);
                    const valB = getValue(loc);
                    setValue(firstSelectedLoc, valB);
                    setValue(loc, valA);
                    return { newState };
                };

                try {
                    await updateGameState(updateFunction, '다른 관리자와 작업이 충돌했습니다.');
                    setSelectedPlayerIds([]);
                } catch (error) {
                     setModal({ type: 'alert', data: { title: '업데이트 충돌', body: error.message }});
                }
            } else { setSelectedPlayerIds([playerId]); }
        }
    }, [isAdmin, selectedPlayerIds, findPlayerLocation, updateGameState]);
    
    const handleSlotClick = useCallback(async (context) => {
        if (!isAdmin || selectedPlayerIds.length === 0) return;
        
        const updateFunction = (currentState, playerDocs) => {
            const newState = JSON.parse(JSON.stringify(currentState));
            const currentLocations = calculateLocations(newState, players);
            const playerUpdates = [];

            const areAllFromWaiting = selectedPlayerIds.every(id => currentLocations[id]?.location === 'waiting');

            if (areAllFromWaiting) {
                const playersToMove = [...selectedPlayerIds];
                const targetArray = context.location === 'schedule' 
                    ? (newState.scheduledMatches[String(context.matchIndex)] || Array(PLAYERS_PER_MATCH).fill(null))
                    : (newState.inProgressCourts[context.courtIndex]?.players || Array(PLAYERS_PER_MATCH).fill(null));

                const availableSlots = targetArray.filter(p => p === null).length;
                if (playersToMove.length > availableSlots) {
                    throw new Error(`자리가 부족합니다. (${availableSlots}자리 남음)`);
                }

                for (let i = 0; i < PLAYERS_PER_MATCH && playersToMove.length > 0; i++) {
                    if (targetArray[i] === null) targetArray[i] = playersToMove.shift();
                }

                if (context.location === 'schedule') {
                    newState.scheduledMatches[String(context.matchIndex)] = targetArray;
                } else { // court
                    const court = newState.inProgressCourts[context.courtIndex] || { players: Array(PLAYERS_PER_MATCH).fill(null), startTime: null };
                    court.players = targetArray;
                    if (!court.startTime && court.players.some(p => p !== null)) {
                        court.startTime = new Date().toISOString();
                    }
                    newState.inProgressCourts[context.courtIndex] = court;

                    selectedPlayerIds.forEach(pid => {
                        const playerDoc = playerDocs[pid];
                        if (playerDoc && playerDoc.exists()) {
                            const playerData = playerDoc.data();
                            playerUpdates.push({ id: pid, changes: { gamesPlayed: playerData.gamesPlayed + 1 } });
                        }
                    });
                }
            } else if (selectedPlayerIds.length === 1) { // Move player from schedule/court
                const playerId = selectedPlayerIds[0];
                const sourceLocation = currentLocations[playerId];
                if (!sourceLocation || sourceLocation.location === 'waiting') return { newState };

                // Remove from source
                if (sourceLocation.location === 'schedule') {
                    newState.scheduledMatches[String(sourceLocation.matchIndex)][sourceLocation.slotIndex] = null;
                } else {
                    newState.inProgressCourts[sourceLocation.matchIndex].players[sourceLocation.slotIndex] = null;
                    if (newState.inProgressCourts[sourceLocation.matchIndex].players.every(p => p === null)) {
                        newState.inProgressCourts[sourceLocation.matchIndex] = null;
                    }
                }
                // Add to destination
                if (context.location === 'schedule') {
                    const match = newState.scheduledMatches[String(context.matchIndex)] || Array(PLAYERS_PER_MATCH).fill(null);
                    if (match[context.slotIndex]) throw new Error("이동하려는 위치가 이미 차 있습니다.");
                    match[context.slotIndex] = playerId;
                    newState.scheduledMatches[String(context.matchIndex)] = match;
                } else {
                    const court = newState.inProgressCourts[context.courtIndex] || { players: Array(PLAYERS_PER_MATCH).fill(null), startTime: null };
                    if (court.players[context.slotIndex]) throw new Error("이동하려는 위치가 이미 차 있습니다.");
                    court.players[context.slotIndex] = playerId;
                    if (!court.startTime && court.players.some(p => p !== null)) {
                        court.startTime = new Date().toISOString();
                    }
                    newState.inProgressCourts[context.courtIndex] = court;
                }
            }
            return { newState, playerUpdates };
        };
        updateFunction.playerIdsToUpdate = selectedPlayerIds;

        try {
            await updateGameState(updateFunction);
            setSelectedPlayerIds([]);
        } catch (error) {
            setModal({ type: 'alert', data: { title: '작업 실패', body: error.message }});
        }
    }, [isAdmin, selectedPlayerIds, players, updateGameState]);
    
    const handleStartMatch = useCallback(async (matchIndex) => {
        if (!gameState) return;
        const match = gameState.scheduledMatches[String(matchIndex)] || [];
        if (match.filter(p => p).length !== PLAYERS_PER_MATCH) return;
        
        const emptyCourts = gameState.inProgressCourts.map((c, i) => c ? -1 : i).filter(i => i !== -1);
        if (emptyCourts.length === 0) { setModal({type: 'alert', data: { title: "시작 불가", body: "빈 코트가 없습니다." } }); return; }

        const start = async (courtIndex) => {
            const playersToMove = gameState.scheduledMatches[String(matchIndex)].filter(Boolean);

            const updateFunction = (currentState, playerDocs) => {
                const newState = JSON.parse(JSON.stringify(currentState));
                newState.inProgressCourts[courtIndex] = { players: playersToMove, startTime: new Date().toISOString() };
                
                const currentScheduledArray = Array.from({ length: newState.numScheduledMatches }).map((_, i) => newState.scheduledMatches[String(i)] || null);
                currentScheduledArray.splice(matchIndex, 1);
                currentScheduledArray.push(null);
                const updatedScheduledMatches = {};
                currentScheduledArray.forEach((match, i) => {
                    if (match && match.some(p => p !== null)) {
                        updatedScheduledMatches[String(i)] = match;
                    }
                });
                newState.scheduledMatches = updatedScheduledMatches;
                
                const playerUpdates = [];
                playersToMove.forEach(pid => {
                    const playerDoc = playerDocs[pid];
                    if (playerDoc && playerDoc.exists()) {
                        const playerData = playerDoc.data();
                        playerUpdates.push({ id: pid, changes: { gamesPlayed: playerData.gamesPlayed + 1 } });
                    }
                });
                return { newState, playerUpdates };
            };
            updateFunction.playerIdsToUpdate = playersToMove;

            try {
                await updateGameState(updateFunction, '다른 관리자와 작업이 충돌했습니다.');
                setModal({type:null, data:null});
            } catch (error) {
                setModal({ type: 'alert', data: { title: '업데이트 충돌', body: error.message }});
            }
        };

        if (emptyCourts.length === 1) { start(emptyCourts[0]); } 
        else { setModal({ type: 'courtSelection', data: { courts: emptyCourts, onSelect: start } }); }
    }, [gameState, updateGameState]);

    const handleEndMatch = useCallback(async (courtIndex) => {
        const updateFunction = (currentState) => {
            const newState = JSON.parse(JSON.stringify(currentState));
            newState.inProgressCourts[courtIndex] = null;
            return { newState };
        };

        try {
            await updateGameState(updateFunction, '다른 관리자와 작업이 충돌했습니다.');
        } catch (error) {
            setModal({ type: 'alert', data: { title: '업데이트 충돌', body: error.message }});
        }
    }, [updateGameState]);
    
    const handleMoveOrSwapCourt = useCallback(async(sourceCourtIndex, targetCourtIndex) => {
        const updateFunction = (currentState) => {
            const newState = JSON.parse(JSON.stringify(currentState));
            const source = newState.inProgressCourts[sourceCourtIndex];
            const target = newState.inProgressCourts[targetCourtIndex];
            newState.inProgressCourts[targetCourtIndex] = source;
            newState.inProgressCourts[sourceCourtIndex] = target;
            return { newState };
        };

        try {
            await updateGameState(updateFunction, '다른 관리자와 작업이 충돌했습니다.');
            setModal({ type: null, data: null });
        } catch (error) {
            setModal({ type: 'alert', data: { title: '업데이트 충돌', body: error.message }});
        }
    }, [updateGameState]);
    
    const handleSettingsUpdate = useCallback(async (type, count) => {
        const field = type === 'scheduled' ? 'numScheduledMatches' : 'numInProgressCourts';
        await updateDoc(gameStateRef, { [field]: count });
    }, []);

    const handleToggleRest = useCallback(async () => {
        if (!currentUser) return;
        const playerDocRef = doc(playersRef, currentUser.id);
        const newRestingState = !currentUser.isResting;
        
        try {
            await updateDoc(playerDocRef, { isResting: newRestingState });
        } catch (error) {
            setModal({ type: 'alert', data: { title: '오류', body: '휴식 상태 변경에 실패했습니다.' }});
        }
    }, [currentUser]);

    if (!authChecked) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400">인증 정보 확인 중...</div></div>;
    }

    if (!currentUser) {
        return <EntryPage onEnter={handleEnter} />;
    }

    if (!gameState) {
        return <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4"><div className="text-yellow-400">경기 정보 로딩 중...</div></div>;
    }

    const waitingPlayers = Object.values(players)
        .filter(p => playerLocations[p.id]?.location === 'waiting')
        .sort((a, b) => new Date(a.entryTime) - new Date(b.entryTime));
    
    const maleWaitingPlayers = waitingPlayers.filter(p => p.gender === '남');
    const femaleWaitingPlayers = waitingPlayers.filter(p => p.gender === '여');

    return (
        <div className="bg-black text-white min-h-screen font-sans flex flex-col" style={{ minWidth: '320px' }}>
            {modal.type === 'confirm' && <ConfirmationModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
            {modal.type === 'courtSelection' && <CourtSelectionModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} />}
            {modal.type === 'editGames' && <EditGamesModal {...modal.data} onCancel={() => setModal({ type: null, data: null })} onSave={async (newCount) => { await updateDoc(doc(playersRef, modal.data.player.id), { gamesPlayed: newCount }); setModal({ type: null, data: null }); }} />}
            {modal.type === 'alert' && <AlertModal {...modal.data} onClose={() => setModal({ type: null, data: null })} />}
            {modal.type === 'moveCourt' && <MoveCourtModal {...modal.data} courts={gameState.inProgressCourts} onSelect={handleMoveOrSwapCourt} onCancel={() => setModal({ type: null, data: null })} />}
            
            {isSettingsOpen && <SettingsModal 
                isAdmin={isAdmin}
                scheduledCount={gameState.numScheduledMatches} 
                courtCount={gameState.numInProgressCourts}
                onUpdate={handleSettingsUpdate}
                onCancel={() => setIsSettingsOpen(false)} 
            />}

            <header className="flex-shrink-0 p-2 flex justify-between items-center bg-gray-900 sticky top-0 z-10">
                <h1 className="text-lg font-bold text-yellow-400">NOERROR</h1>
                <div className="flex items-center">
                    <button
                        onClick={handleToggleRest}
                        className={`mr-3 py-1 px-2 rounded-md text-xs font-bold transition-colors ${
                            currentUser.isResting
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                        }`}
                    >
                        {currentUser.isResting ? '휴식 종료' : '휴식 시작'}
                    </button>
                    {isAdmin && (
                        <button onClick={() => setIsSettingsOpen(true)} className="text-gray-400 hover:text-white mr-3 text-lg">
                            <i className="fas fa-cog"></i>
                        </button>
                    )}
                    <div className="text-right">
                        <span className="text-xs">{isAdmin ? '👑' : ''} {currentUser.name}</span>
                        <button onClick={handleLogout} className="ml-2 bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded-md text-xs">나가기</button>
                    </div>
                </div>
            </header>

            <main className="flex-grow flex flex-col gap-4 p-1">
                <WaitingListSection
                    maleWaitingPlayers={maleWaitingPlayers}
                    femaleWaitingPlayers={femaleWaitingPlayers}
                    selectedPlayerIds={selectedPlayerIds}
                    isAdmin={isAdmin}
                    handleCardClick={handleCardClick}
                    handleDeleteFromWaiting={handleDeleteFromWaiting}
                    setModal={setModal}
                    currentUser={currentUser}
                />
                <ScheduledMatchesSection
                    numScheduledMatches={gameState.numScheduledMatches}
                    scheduledMatches={gameState.scheduledMatches}
                    players={players}
                    selectedPlayerIds={selectedPlayerIds}
                    isAdmin={isAdmin}
                    handleCardClick={handleCardClick}
                    handleReturnToWaiting={handleReturnToWaiting}
                    setModal={setModal}
                    handleSlotClick={handleSlotClick}
                    handleStartMatch={handleStartMatch}
                    currentUser={currentUser}
                />
                <InProgressCourtsSection
                    numInProgressCourts={gameState.numInProgressCourts}
                    inProgressCourts={gameState.inProgressCourts}
                    players={players}
                    selectedPlayerIds={selectedPlayerIds}
                    isAdmin={isAdmin}
                    handleCardClick={handleCardClick}
                    handleReturnToWaiting={handleReturnToWaiting}
                    setModal={setModal}
                    handleSlotClick={handleSlotClick}
                    handleEndMatch={handleEndMatch}
                    currentUser={currentUser}
                />
            </main>
            <style>{`.player-card {-webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;}`}</style>
        </div>
    );
}

// ===================================================================================
// Modals and Entry Page
// ===================================================================================
function EntryPage({ onEnter }) {
    const [formData, setFormData] = useState({ name: '', level: 'A조', gender: '남', isGuest: false });

    useEffect(() => {
        const savedUserId = localStorage.getItem('badminton-currentUser-id');
        if (savedUserId) {
             getDoc(doc(playersRef, savedUserId)).then(docSnap => {
                if (docSnap.exists()) { setFormData(prev => ({...prev, ...docSnap.data()})); }
            });
        }
    }, []);

    const handleChange = (e) => { 
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value })); 
    };
    const handleSubmit = (e) => { e.preventDefault(); onEnter(formData); };
    
    const levelButtons = ['A조', 'B조', 'C조', 'D조'].map(level => (
        <button
            key={level}
            type="button"
            name="level"
            onClick={() => setFormData(prev => ({ ...prev, level }))}
            className={`w-full p-2 rounded-md font-bold transition-colors ${formData.level === level ? 'bg-yellow-500 text-black' : 'bg-gray-600 text-white'}`}
        >
            {level}
        </button>
    ));

    return (
        <div className="bg-black text-white min-h-screen flex items-center justify-center font-sans p-4">
            <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-sm">
                <h1 className="text-3xl font-bold text-yellow-400 mb-6 text-center">NOERROR</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" name="name" placeholder="이름" value={formData.name} onChange={handleChange} className="w-full bg-gray-700 text-white p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-400" required />
                    <div className="grid grid-cols-4 gap-2">
                        {levelButtons}
                    </div>
                    <div className="flex justify-around items-center text-lg">
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="남" checked={formData.gender === '남'} onChange={handleChange} className="mr-2 h-4 w-4 text-yellow-500 bg-gray-700 border-gray-600 focus:ring-yellow-500" /> 남자</label>
                        <label className="flex items-center cursor-pointer"><input type="radio" name="gender" value="여" checked={formData.gender === '여'} onChange={handleChange} className="mr-2 h-4 w-4 text-pink-500 bg-gray-700 border-gray-600 focus:ring-pink-500" /> 여자</label>
                    </div>
                    <div className="text-center">
                        <label className="flex items-center justify-center text-lg cursor-pointer">
                            <input type="checkbox" name="isGuest" checked={formData.isGuest} onChange={handleChange} className="mr-2 h-4 w-4 rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500" />
                            게스트
                        </label>
                    </div>
                    <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 rounded-lg transition duration-300">입장하기</button>
                </form>
            </div>
        </div>
    );
}
function SettingsModal({ isAdmin, scheduledCount, courtCount, onUpdate, onCancel }) {
    if (!isAdmin) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg">
                <h3 className="text-xl font-bold text-white mb-6">설정</h3>
                
                <div className="space-y-4">
                    <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                        <span className="font-semibold">경기 예정</span>
                        <div className="flex items-center gap-4">
                            <button onClick={() => onUpdate('scheduled', Math.max(1, scheduledCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button>
                            <span className="text-xl font-bold w-8">{scheduledCount}</span>
                            <button onClick={() => onUpdate('scheduled', scheduledCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button>
                        </div>
                    </div>
                    <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                        <span className="font-semibold">경기 진행 코트</span>
                        <div className="flex items-center gap-4">
                            <button onClick={() => onUpdate('courts', Math.max(1, courtCount - 1))} className="w-8 h-8 bg-gray-600 rounded-full text-lg">-</button>
                            <span className="text-xl font-bold w-8">{courtCount}</span>
                            <button onClick={() => onUpdate('courts', courtCount + 1)} className="w-8 h-8 bg-gray-600 rounded-full text-lg">+</button>
                        </div>
                    </div>
                </div>

                <button onClick={onCancel} className="mt-6 w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">나가기</button>
            </div>
        </div>
    );
}

function ConfirmationModal({ title, body, onConfirm, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-white mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg transition-colors">확인</button></div></div></div>); }
function CourtSelectionModal({ courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">코트 선택</h3><p className="text-gray-300 mb-6">경기를 시작할 코트를 선택해주세요.</p><div className="flex flex-col gap-3">{courts.map(courtIdx => ( <button key={courtIdx} onClick={() => onSelect(courtIdx)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">{courtIdx + 1}번 코트에서 시작</button> ))}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }
function EditGamesModal({ player, onSave, onCancel }) {
    const [count, setCount] = useState(player.gamesPlayed);
    return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-xs text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{player.name} 경기 수 수정</h3><div className="flex items-center justify-center gap-4 my-6"><button onClick={() => setCount(c => Math.max(0, c - 1))} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">-</button><span className="text-4xl font-bold w-16 text-center text-white">{count}</span><button onClick={() => setCount(c => c + 1)} className="px-4 py-2 bg-gray-600 rounded-full text-2xl w-14 h-14 flex items-center justify-center">+</button></div><div className="flex gap-4"><button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button><button onClick={() => onSave(count)} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">저장</button></div></div></div> );
}
function AlertModal({ title, body, onClose }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{title}</h3><p className="text-gray-300 mb-6">{body}</p><button onClick={onClose} className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2 rounded-lg transition-colors">확인</button></div></div> ); }
function MoveCourtModal({ sourceCourtIndex, courts, onSelect, onCancel }) { return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-gray-800 rounded-lg p-6 w-full max-w-sm text-center shadow-lg"><h3 className="text-xl font-bold text-yellow-400 mb-4">{sourceCourtIndex + 1}번 코트 경기 이동</h3><p className="text-gray-300 mb-6">어느 코트로 이동/교체할까요?</p><div className="flex flex-col gap-3">{courts.map((court, idx) => { if (idx === sourceCourtIndex) return null; return ( <button key={idx} onClick={() => onSelect(sourceCourtIndex, idx)} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 rounded-lg transition-colors">{idx + 1}번 코트</button> )})}</div><button onClick={onCancel} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 rounded-lg transition-colors">취소</button></div></div> ); }

