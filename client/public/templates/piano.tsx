import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as Tone from 'tone';
import { Music, Sun, Moon, Volume2, VolumeX, ChevronDown, Play, Square } from 'lucide-react';

type Instrument = 'piano' | 'synth' | 'kalimba' | 'organ' | 'violin';
type Theme = 'light' | 'dark';

interface PianoKey {
  note: string;
  keyboardKey: string;
  type: 'white' | 'black';
}

interface SheetNote {
  note: string;
  duration: number;
  pause?: number;
}

const KEY_MAP: PianoKey[] = [
  { note: 'C4', keyboardKey: 'A', type: 'white' },
  { note: 'C#4', keyboardKey: 'W', type: 'black' },
  { note: 'D4', keyboardKey: 'S', type: 'white' },
  { note: 'D#4', keyboardKey: 'E', type: 'black' },
  { note: 'E4', keyboardKey: 'D', type: 'white' },
  { note: 'F4', keyboardKey: 'F', type: 'white' },
  { note: 'F#4', keyboardKey: 'T', type: 'black' },
  { note: 'G4', keyboardKey: 'G', type: 'white' },
  { note: 'G#4', keyboardKey: 'Y', type: 'black' },
  { note: 'A4', keyboardKey: 'H', type: 'white' },
  { note: 'A#4', keyboardKey: 'U', type: 'black' },
  { note: 'B4', keyboardKey: 'J', type: 'white' },
  { note: 'C5', keyboardKey: 'K', type: 'white' },
  { note: 'C#5', keyboardKey: 'O', type: 'black' },
  { note: 'D5', keyboardKey: 'L', type: 'white' },
  { note: 'D#5', keyboardKey: 'P', type: 'black' },
  { note: 'E5', keyboardKey: ';', type: 'white' },
  { note: 'F5', keyboardKey: "'", type: 'white' },
];

const SHEET_MUSIC: SheetNote[] = [
  { note: 'C4', duration: 0.5, pause: 0.1 },
  { note: 'D4', duration: 0.5, pause: 0.1 },
  { note: 'E4', duration: 0.5, pause: 0.1 },
  { note: 'C4', duration: 0.5, pause: 0.2 },
  { note: 'C4', duration: 0.5, pause: 0.1 },
  { note: 'D4', duration: 0.5, pause: 0.1 },
  { note: 'E4', duration: 0.5, pause: 0.1 },
  { note: 'C4', duration: 0.5, pause: 0.3 },
  { note: 'E4', duration: 0.5, pause: 0.1 },
  { note: 'F4', duration: 0.5, pause: 0.1 },
  { note: 'G4', duration: 1.0, pause: 0.2 },
  { note: 'E4', duration: 0.5, pause: 0.1 },
  { note: 'F4', duration: 0.5, pause: 0.1 },
  { note: 'G4', duration: 1.0, pause: 0.3 },
];

const DigitalPiano: React.FC = () => {
  const [instrument, setInstrument] = useState<Instrument>('piano');
  const [activeNotes, setActiveNotes] = useState<string[]>([]);
  const [theme, setTheme] = useState<Theme>('light');
  const [isMuted, setIsMuted] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentNoteIndex, setCurrentNoteIndex] = useState(-1);
  const [isAudioReady, setIsAudioReady] = useState(false);
  
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const activeNotesRef = useRef<Set<string>>(new Set());
  const playbackTimeoutRef = useRef<ReturnType<Window["setTimeout"]> | null>(null);

  // 主题切换
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // 创建音频合成器
  const createSynth = (instrumentType: Instrument): Tone.PolySynth => {
    let config = {};
    
    switch (instrumentType) {
      case 'synth':
        config = { 
          oscillator: { type: 'fatsawtooth' }, 
          envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.4 } 
        };
        break;
      case 'kalimba':
        config = { 
          oscillator: { type: 'sine' }, 
          envelope: { attack: 0.001, decay: 0.8, sustain: 0.1, release: 0.8 } 
        };
        break;
      case 'organ':
        config = { 
          oscillator: { type: 'fmtriangle', harmonicity: 2, modulationType: 'sine' }, 
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.1 } 
        };
        break;
      case 'violin':
        config = {
          oscillator: { 
            type: 'fmsawtooth',
            harmonicity: 1.5,
            modulationType: 'triangle',
            modulationIndex: 12
          },
          envelope: { 
            attack: 0.2, 
            decay: 0.3, 
            sustain: 0.7, 
            release: 1.2 
          }
        };
        break;
      default:
        config = { 
          oscillator: { type: 'triangle' }, 
          envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 } 
        };
        break;
    }
    
    return new Tone.PolySynth(Tone.Synth, config).toDestination();
  };

  // 初始化音频
  useEffect(() => {
    const initAudio = async () => {
      try {
        if (synthRef.current) {
          synthRef.current.dispose();
        }
        
        const synth = createSynth(instrument);
        synthRef.current = synth;
        
        if (Tone.context.state !== 'running') {
          await Tone.start();
        }
        
        setIsAudioReady(true);
      } catch (error) {
        console.error("音频初始化失败:", error);
        setIsAudioReady(false);
      }
    };

    initAudio();

    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, [instrument]);

  // 播放音符
  const playNote = useCallback((note: string) => {
    if (!synthRef.current || isMuted || !isAudioReady || activeNotesRef.current.has(note)) {
      return;
    }
    
    try {
      synthRef.current.triggerAttack(note, Tone.now());
      activeNotesRef.current.add(note);
      setActiveNotes(Array.from(activeNotesRef.current));
    } catch (e) {
      console.error(`播放音符 ${note} 失败:`, e);
    }
  }, [isMuted, isAudioReady]);

  // 停止音符
  const stopNote = useCallback((note: string) => {
    if (!synthRef.current || !activeNotesRef.current.has(note)) {
      return;
    }
    
    try {
      synthRef.current.triggerRelease(note, Tone.now() + 0.05);
      activeNotesRef.current.delete(note);
      setActiveNotes(Array.from(activeNotesRef.current));
    } catch (e) {
      console.error(`停止音符 ${note} 失败:`, e);
    }
  }, []);

  // 自动演奏
  const playSheetMusic = useCallback(() => {
    if (isMuted || !isAudioReady) return;
    
    setIsPlaying(true);
    setCurrentNoteIndex(0);
    
    const playNextNote = (index: number) => {
      if (index >= SHEET_MUSIC.length) {
        setIsPlaying(false);
        setCurrentNoteIndex(-1);
        return;
      }
      
      const currentNote = SHEET_MUSIC[index];
      setCurrentNoteIndex(index);
      
      if (synthRef.current && !isMuted) {
        try {
          synthRef.current.triggerAttack(currentNote.note, Tone.now());
          activeNotesRef.current.add(currentNote.note);
          setActiveNotes(Array.from(activeNotesRef.current));
        } catch (e) {
          console.error(`播放音符 ${currentNote.note} 失败:`, e);
        }
      }
      
      setTimeout(() => {
        if (synthRef.current && activeNotesRef.current.has(currentNote.note)) {
          try {
            synthRef.current.triggerRelease(currentNote.note, Tone.now() + 0.05);
            activeNotesRef.current.delete(currentNote.note);
            setActiveNotes(Array.from(activeNotesRef.current));
          } catch (e) {
            console.error(`停止音符 ${currentNote.note} 失败:`, e);
          }
        }
      }, currentNote.duration * 1000);
      
      const nextDelay = (currentNote.duration + (currentNote.pause || 0)) * 1000;
      playbackTimeoutRef.current = setTimeout(() => {
        playNextNote(index + 1);
      }, nextDelay);
    };
    
    playNextNote(0);
  }, [isMuted, isAudioReady]);

  // 停止演奏
  const stopSheetMusic = useCallback(() => {
    setIsPlaying(false);
    setCurrentNoteIndex(-1);
    
    if (playbackTimeoutRef.current) {
      clearTimeout(playbackTimeoutRef.current);
      playbackTimeoutRef.current = null;
    }
    
    if (synthRef.current) {
      try {
        synthRef.current.releaseAll();
        activeNotesRef.current.clear();
        setActiveNotes([]);
      } catch (e) {
        console.error('释放所有音符失败:', e);
      }
    }
  }, []);

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      
      const keyPressed = event.key.toUpperCase();
      if (pressedKeysRef.current.has(keyPressed)) return;
      
      const key = KEY_MAP.find(k => k.keyboardKey.toUpperCase() === keyPressed);
      if (key) {
        event.preventDefault();
        pressedKeysRef.current.add(keyPressed);
        playNote(key.note);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const keyPressed = event.key.toUpperCase();
      const key = KEY_MAP.find(k => k.keyboardKey.toUpperCase() === keyPressed);
      if (key && pressedKeysRef.current.has(keyPressed)) {
        event.preventDefault();
        pressedKeysRef.current.delete(keyPressed);
        stopNote(key.note);
      }
    };

    const handleBlur = () => {
      pressedKeysRef.current.clear();
      activeNotesRef.current.clear();
      setActiveNotes([]);
      if (synthRef.current) {
        try {
          synthRef.current.releaseAll();
        } catch (e) {
          console.error('释放所有音符失败:', e);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleBlur);
    };
  }, [playNote, stopNote]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
      }
    };
  }, []);

  const instrumentOptions = [
    { id: 'piano' as Instrument, name: '钢琴' },
    { id: 'synth' as Instrument, name: '合成器' },
    { id: 'kalimba' as Instrument, name: '卡林巴' },
    { id: 'organ' as Instrument, name: '风琴' },
    { id: 'violin' as Instrument, name: '小提琴' },
  ];

  return (
    <div className={`w-full min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 ${theme === 'dark' ? 'dark from-gray-900 to-gray-800' : ''} transition-all duration-700 flex flex-col items-center justify-center p-4`}>
      <div className="w-full max-w-5xl mx-auto">
        {/* 顶部控制栏 */}
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8">
          <h2 className="text-4xl font-bold mb-4 sm:mb-0 text-gray-800 dark:text-gray-100">
            🎹 数码钢琴
          </h2>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="p-2 rounded-full bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-lg border border-gray-200 dark:border-gray-600"
            >
              {isMuted ? (
                <VolumeX size={24} className="text-gray-700 dark:text-gray-300" />
              ) : (
                <Volume2 size={24} className="text-gray-700 dark:text-gray-300" />
              )}
            </button>
            <button 
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} 
              className="p-3 rounded-full bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors shadow-lg border border-gray-200 dark:border-gray-600"
            >
              {theme === 'light' ? (
                <Moon size={24} className="text-gray-700 dark:text-gray-300" />
              ) : (
                <Sun size={24} className="text-gray-700 dark:text-gray-300" />
              )}
            </button>
          </div>
        </header>

        {/* 音色选择 */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
          <Music className="mr-2 text-blue-600 dark:text-blue-400" size={24} />
          <span className="text-gray-700 dark:text-gray-300 font-semibold mr-4">音色选择：</span>
          {instrumentOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setInstrument(opt.id)}
              className={`px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-200 shadow-md ${
                instrument === opt.id
                  ? 'bg-blue-600 text-white shadow-lg transform scale-105'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>

        {/* 乐谱区域 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-8 overflow-hidden">
          <div 
            className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            onClick={() => setIsSheetExpanded(!isSheetExpanded)}
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
              🎵 两只老虎 乐谱
            </h3>
            <div className="flex items-center space-x-2">
              {isSheetExpanded && (
                <div className="flex space-x-2">
                  {!isPlaying ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); playSheetMusic(); }}
                      className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
                      disabled={isMuted || !isAudioReady}
                    >
                      <Play size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); stopSheetMusic(); }}
                      className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                    >
                      <Square size={16} />
                    </button>
                  )}
                </div>
              )}
              <ChevronDown 
                size={20} 
                className={`text-gray-500 transition-transform duration-300 ${isSheetExpanded ? 'rotate-180' : ''}`} 
              />
            </div>
          </div>
          
          {isSheetExpanded && (
            <div className="border-t border-gray-200 dark:border-gray-700 p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {isPlaying && currentNoteIndex >= 0 && (
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      正在播放第 {currentNoteIndex + 1} 个音符
                    </span>
                  )}
                </div>
                <div className="flex space-x-2">
                  {!isPlaying ? (
                    <button
                      onClick={playSheetMusic}
                      className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                      disabled={isMuted || !isAudioReady}
                    >
                      <Play size={16} />
                      <span>自动演奏</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopSheetMusic}
                      className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <Square size={16} />
                      <span>停止</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* 乐谱显示 */}
              <div className="text-center space-y-4">
                <h4 className="text-xl font-bold text-gray-800 dark:text-gray-200">两只老虎</h4>
                <div className="flex justify-center space-x-2 flex-wrap">
                  {SHEET_MUSIC.map((note, index) => {
                    const isActive = currentNoteIndex === index && isPlaying;
                    return (
                      <div
                        key={index}
                        className={`px-3 py-2 rounded-lg border transition-all ${
                          isActive
                            ? 'bg-blue-500 text-white border-blue-600 scale-110'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {note.note}
                      </div>
                    );
                  })}
                </div>
                <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                  歌词：两只老虎 两只老虎 跑得快 跑得快<br />
                  一只没有眼睛 一只没有尾巴 真奇怪 真奇怪
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 钢琴主体 */}
        <div className="relative w-full max-w-4xl mx-auto bg-gradient-to-b from-gray-800 via-gray-900 to-black rounded-lg shadow-2xl border border-gray-700">
          {/* 钢琴顶部面板 */}
          <div className="bg-gradient-to-b from-gray-700 to-gray-800 p-4 rounded-t-lg border-b border-gray-600">
            <div className="text-center">
              <h2 className="text-xl font-serif text-gray-200 tracking-wider">YAMAHA</h2>
              <p className="text-sm text-gray-400 mt-1">Digital Piano</p>
              {!isAudioReady && (
                <p className="text-xs text-yellow-400 mt-1">音频初始化中...</p>
              )}
            </div>
          </div>

          {/* 键盘容器 */}
          <div className="relative p-6 bg-gradient-to-b from-gray-900 to-black">
            <div className="relative w-full h-64 bg-gradient-to-b from-gray-100 to-gray-50 rounded-lg shadow-inner border-2 border-gray-300 p-1">
              <div className="relative w-full h-full">
                {/* 白键 */}
                <div className="relative w-full h-full flex">
                  {KEY_MAP.filter(k => k.type === 'white').map((key) => {
                    const isActive = activeNotes.includes(key.note);
                    return (
                      <div
                        key={key.note}
                        onMouseDown={() => playNote(key.note)}
                        onMouseUp={() => stopNote(key.note)}
                        onMouseLeave={() => stopNote(key.note)}
                        onTouchStart={(e) => { e.preventDefault(); playNote(key.note); }}
                        onTouchEnd={(e) => { e.preventDefault(); stopNote(key.note); }}
                        className={`relative flex-1 h-full mx-px cursor-pointer transition-all duration-100 border-r border-gray-400 last:border-r-0 rounded-b-md ${
                          isActive 
                            ? 'bg-gradient-to-b from-blue-200 to-blue-300 shadow-inner transform translate-y-1' 
                            : 'bg-gradient-to-b from-white to-gray-100 hover:from-gray-50 hover:to-gray-200'
                        }`}
                        style={{ 
                          boxShadow: isActive 
                            ? 'inset 0 3px 6px rgba(0,0,0,0.2)' 
                            : '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-center">
                          <div className="text-xs font-bold text-gray-700 mb-1">
                            {key.keyboardKey.toUpperCase()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {key.note}
                          </div>
                        </div>
                        <div className="absolute top-2 left-2 right-2 h-8 bg-gradient-to-b from-white/30 to-transparent rounded-sm"></div>
                      </div>
                    );
                  })}
                </div>
                
                {/* 黑键 */}
                <div className="absolute top-0 left-0 w-full h-3/5 pointer-events-none">
                  {KEY_MAP.filter(k => k.type === 'black').map(key => {
                    const whiteKeys = KEY_MAP.filter(k => k.type === 'white');
                    const blackKeyPositions: { [key: string]: number } = {
                      'C#4': 0.75,  'D#4': 1.75,  'F#4': 3.75,  
                      'G#4': 4.75,  'A#4': 5.75,  'C#5': 7.75,  'D#5': 8.75
                    };
                    
                    const position = blackKeyPositions[key.note] || 0;
                    const isActive = activeNotes.includes(key.note);
                    
                    return (
                      <div
                        key={key.note}
                        onMouseDown={(e) => { e.stopPropagation(); playNote(key.note); }}
                        onMouseUp={(e) => { e.stopPropagation(); stopNote(key.note); }}
                        onMouseLeave={(e) => { e.stopPropagation(); stopNote(key.note); }}
                        onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); playNote(key.note); }}
                        onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); stopNote(key.note); }}
                        className={`absolute h-full z-10 cursor-pointer pointer-events-auto transition-all duration-100 rounded-b-md ${
                          isActive 
                            ? 'bg-gradient-to-b from-blue-600 to-blue-800 shadow-inner transform translate-y-1' 
                            : 'bg-gradient-to-b from-gray-800 to-black hover:from-gray-700 hover:to-gray-900'
                        }`}
                        style={{ 
                          left: `${position * (100 / whiteKeys.length)}%`,
                          width: `${100 / whiteKeys.length * 0.6}%`,
                          boxShadow: isActive 
                            ? 'inset 0 3px 6px rgba(0,0,0,0.4)' 
                            : '0 2px 6px rgba(0,0,0,0.3)'
                        }}
                      >
                        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 text-center">
                          <div className="text-xs font-bold text-white mb-1">
                            {key.keyboardKey.toUpperCase()}
                          </div>
                          <div className="text-xs text-gray-300">
                            {key.note}
                          </div>
                        </div>
                        <div className="absolute top-1 left-1 right-1 h-4 bg-gradient-to-b from-white/20 to-transparent rounded-sm"></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 控制面板 */}
            <div className="mt-4 flex justify-center items-center space-x-4 p-3 bg-gray-800 rounded-lg">
              <div className={`w-3 h-3 rounded-full shadow-lg ${isAudioReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div className="text-xs text-gray-400">{isAudioReady ? '音频就绪' : '音频加载中'}</div>
            </div>
          </div>

          {/* 钢琴支架 */}
          <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-2 rounded-b-lg">
            <div className="h-2 bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalPiano;