import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { HandLandmarker, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { Power, Zap, Activity, Skull, Volume2, VolumeX, Play, ExternalLink } from 'lucide-react';
import { DetectionResult, MOEA_COLORS, ColorOption } from './types';
import Visualizer from './components/Visualizer';
import AudioVisualizer from './components/AudioVisualizer';

// Local MP3: Imagination
const DEMO_TRACK_URL = `${import.meta.env.BASE_URL}imagination.mp3`;
const FALLBACK_IMAGE_URL = "https://images.unsplash.com/photo-1599368558742-1262d0806495?q=80&w=400&auto=format&fit=crop";

const App = () => {
  const [activeColor, setActiveColor] = useState<ColorOption>(MOEA_COLORS[0]);
  const [isArActive, setIsArActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [trackingData, setTrackingData] = useState<DetectionResult | null>(null);
  
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [audioIntensity, setAudioIntensity] = useState(0);
  const [songProgress, setSongProgress] = useState(0); // 0..1
  const [analyserData, setAnalyserData] = useState<Uint8Array | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const requestRef = useRef<number | null>(null);

  // Audio analysis loop
  useEffect(() => {
    if (!isPlaying || !audioRef.current) return;

    const analyze = () => {
      if (analyserRef.current && dataArrayRef.current && audioRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
        const average = dataArrayRef.current.reduce((a, b) => a + b) / dataArrayRef.current.length;
        const normalized = Math.min(average / 255, 1.0);
        
        setAudioIntensity(normalized);
        setAnalyserData(new Uint8Array(dataArrayRef.current));
        setSongProgress(audioRef.current.currentTime / (audioRef.current.duration || 166)); // 166s = 2:46
      }
      requestAnimationFrame(analyze);
    };

    requestAnimationFrame(analyze);

    return () => {
      // Cleanup handled by cleanup
    };
  }, [isPlaying]);

  const startExperience = async () => {
    // 1. Initialize Audio IMMEDIATELY to capture user gesture
    if (audioRef.current) {
      audioRef.current.volume = 0.8;
      
      // Initialize Web Audio API for analysis
      if (!audioContextRef.current) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        
        const source = audioContext.createMediaElementSource(audioRef.current);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array;
      }
      
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setAudioError(false);
          })
          .catch((error) => {
            console.warn("Autoplay prevented:", error);
            setIsPlaying(false);
          });
      }
    }

    setIsLoading(true);
    setAudioError(false);
    
    try {
      // 2. Initialize Camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to actually load data
        await new Promise((resolve) => {
            videoRef.current!.onloadedmetadata = () => {
                videoRef.current!.play();
                resolve(true);
            };
        });
        
        const texture = new THREE.VideoTexture(videoRef.current!);
        texture.colorSpace = THREE.SRGBColorSpace;
        setVideoTexture(texture);
      }

      // 3. Initialize AI Models
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      
      handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 1
      });

      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1
      });

      setIsArActive(true);
      detectFrame();

    } catch (error) {
      console.error("Error initializing AR:", error);
      alert("System initialization failed. Please allow camera access.");
    } finally {
      setIsLoading(false);
    }
  };

  const stopExperience = () => {
    setIsArActive(false);
    setIsPlaying(false);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setVideoTexture(null);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const toggleAudio = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!audioRef.current) return;
    
    if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
    } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    setIsPlaying(true);
                    setAudioError(false);
                })
                .catch((err) => {
                    console.error("Playback failed", err);
                    setAudioError(true);
                    setIsPlaying(false);
                });
        }
    }
  };

  const detectFrame = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      const startTimeMs = performance.now();
      
      let handResults = null;
      let faceResults = null;

      if (handLandmarkerRef.current) {
        handResults = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
      }
      
      if (faceLandmarkerRef.current) {
        faceResults = faceLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);
      }
      
      if (handResults || faceResults) {
        setTrackingData({ 
            handLandmarks: handResults?.landmarks || [],
            faceLandmarks: faceResults?.faceLandmarks || []
        });
      }
    }
    requestRef.current = requestAnimationFrame(detectFrame);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-mono">
      <video ref={videoRef} className="hidden" playsInline muted />
      <audio 
        ref={audioRef} 
        src={DEMO_TRACK_URL} 
        preload="auto"
        loop 
        onError={(e) => {
            console.error("Audio error", e);
            setAudioError(true);
            setIsPlaying(false);
        }}
      />

      {/* 3D Canvas - Full Screen */}
      {isArActive && videoTexture && (
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
            <Visualizer 
              videoTexture={videoTexture} 
              trackingData={trackingData} 
              activeColor={activeColor.hex}
              audioIntensity={audioIntensity}
              songProgress={songProgress}
            />
          </Canvas>
        </div>
      )}

      {/* Intro Screen */}
      {!isArActive && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white p-6">
           <div className="border border-white p-12 flex flex-col items-center max-w-lg w-full relative">
               <div className="absolute top-0 left-0 w-2 h-2 bg-white"></div>
               <div className="absolute top-0 right-0 w-2 h-2 bg-white"></div>
               <div className="absolute bottom-0 left-0 w-2 h-2 bg-white"></div>
               <div className="absolute bottom-0 right-0 w-2 h-2 bg-white"></div>
               
               <h1 className="text-8xl font-black tracking-tighter mb-4 glitch-text leading-none" data-text="MOEA">MOEA</h1>
               <div className="w-full h-px bg-white mb-4"></div>
               <h2 className="text-xl tracking-[1em] text-center mb-8">IMAGINATION</h2>
               
               <button
                 onClick={!isLoading ? startExperience : undefined}
                 disabled={isLoading}
                 className="w-full py-4 bg-white text-black font-bold text-xl hover:bg-red-600 hover:text-white transition-colors uppercase flex items-center justify-center gap-2"
               >
                 {isLoading ? "LOADING_MODULES..." : (
                    <>
                        INITIALIZE_SYSTEM <Play size={20} fill="currentColor" />
                    </>
                 )}
               </button>
               
               <p className="mt-4 text-[10px] text-gray-500 uppercase text-center">
                 Allow camera access for neural interface. <br/>
                 Hand & Face tracking active.
               </p>
           </div>
        </div>
      )}

      {/* AR Overlay UI */}
      {isArActive && (
        <>
          {/* Top Left - Album & Listen Link */}
          <div className="absolute top-6 left-6 z-50 pointer-events-auto flex items-start gap-4">
             <a 
               href="https://open.spotify.com/artist/3LXxiBWZbjFQPrtL0yZ2Q8"
               target="_blank"
               rel="noreferrer"
               className="group block relative cursor-pointer"
             >
                <div className={`w-32 h-32 bg-neutral-900 border ${isPlaying ? 'border-red-600' : 'border-white/30'} group-hover:border-white transition-colors flex items-center justify-center overflow-hidden`}>
                   {/* Surreal Rabbit Image */}
                   <img 
                      src={`${import.meta.env.BASE_URL}imaginationCover.jpg`}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = FALLBACK_IMAGE_URL;
                      }}
                      alt="MOEA - IMAGINATION"
                      className={`w-full h-full object-cover transition-all duration-1000 ${isPlaying ? 'mix-blend-normal scale-105' : 'mix-blend-luminosity scale-100'}`}
                   />
                   {/* Hover Overlay */}
                   <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="text-white" />
                   </div>
                </div>
                {/* Audio Viz Indicator */}
                {isPlaying && (
                    <div className="absolute -bottom-1 -right-1 flex gap-0.5 h-3 items-end">
                        <div className="w-1 bg-red-600 animate-[bounce_1s_infinite]"></div>
                        <div className="w-1 bg-red-600 animate-[bounce_1.2s_infinite]"></div>
                        <div className="w-1 bg-red-600 animate-[bounce_0.8s_infinite]"></div>
                    </div>
                )}
             </a>
             
             <div className="flex flex-col pt-1">
                <a 
                    href="https://open.spotify.com/artist/3LXxiBWZbjFQPrtL0yZ2Q8"
                    target="_blank"
                    rel="noreferrer"
                    className={`text-left text-xs font-bold tracking-widest px-2 py-0.5 mb-1 transition-all inline-block ${isPlaying ? 'bg-red-600 text-white animate-pulse' : 'bg-white/10 text-gray-400 hover:bg-white hover:text-black'}`}
                >
                    {isPlaying ? 'LISTENING NOW' : 'LISTEN NOW'}
                </a>
                <a 
                    href="https://open.spotify.com/artist/3LXxiBWZbjFQPrtL0yZ2Q8" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-white text-xl font-bold leading-none tracking-tighter hover:text-red-500 transition-colors"
                >
                    MOEA
                </a>
                <span className="text-white/60 text-sm tracking-[0.2em]">IMAGINATION</span>
             </div>
          </div>

          {/* Minimal Bottom UI */}
          <div className="absolute bottom-0 left-0 w-full z-50 p-6 flex flex-col items-center pointer-events-none">
            
            {/* Status Bar */}
            <div className="flex w-full max-w-2xl justify-between items-end text-[10px] text-white/50 uppercase tracking-widest mb-2">
              <div className="flex flex-col gap-1">
                 <span className="flex items-center gap-2"><Zap size={10} /> SYS_READY</span>
                 <span className="flex items-center gap-2 text-white">
                   <Activity size={10} className={trackingData?.handLandmarks.length ? "text-green-500" : "text-white/20"} /> 
                   HAND_TRK
                 </span>
                 <span className="flex items-center gap-2 text-white">
                   <Skull size={10} className={trackingData?.faceLandmarks.length ? "text-green-500" : "text-white/20"} /> 
                   FACE_TRK
                 </span>
              </div>
              
              {/* Centered Controls */}
              <div className="pointer-events-auto flex items-center gap-4 bg-black border border-white/20 p-2 shadow-[0_0_20px_rgba(0,0,0,0.8)]">
                 {/* Color Palette */}
                 <div className="flex gap-2">
                    {MOEA_COLORS.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => setActiveColor(c)}
                        className={`w-4 h-4 border transition-all ${
                          activeColor.name === c.name 
                            ? 'border-white bg-white' 
                            : 'border-white/40 bg-transparent hover:border-white'
                        }`}
                        style={{ 
                          boxShadow: activeColor.name === c.name ? `0 0 8px ${c.hex}` : 'none'
                        }}
                        title={c.name}
                      />
                    ))}
                 </div>

                 <div className="w-px h-6 bg-white/20 mx-2"></div>

                 {/* Audio Control */}
                 <button 
                   onClick={toggleAudio}
                   className={`w-6 h-6 flex items-center justify-center border transition-colors ${audioError ? 'border-red-900 text-red-900' : 'border-white/40 hover:border-white text-white'}`}
                   title="Toggle Audio"
                 >
                   {audioError ? <VolumeX size={12} /> : (isPlaying ? <Volume2 size={12} /> : <VolumeX size={12} className="opacity-50" />)}
                 </button>

                 <div className="w-px h-6 bg-white/20 mx-2"></div>

                 {/* Exit Button */}
                 <button 
                   onClick={stopExperience}
                   className="w-6 h-6 flex items-center justify-center border border-white/40 hover:bg-red-600 hover:border-red-600 hover:text-black text-white transition-colors"
                 >
                   <Power size={12} />
                 </button>
              </div>

              <div className="text-right">
                <div className={`flex items-center justify-end gap-2 ${isPlaying ? 'text-white' : 'text-white/30'}`}>
                    {isPlaying ? <Activity size={10} className="animate-pulse" /> : <VolumeX size={10} />} 
                    AUDIO_{isPlaying ? 'ON' : 'OFF'}
                </div>
                <div>MOD: {activeColor.name}</div>
              </div>
            </div>

            {/* Right Side - Audio Visualizer */}
            <div className="absolute top-6 right-6 z-50 pointer-events-none">
              <AudioVisualizer audioIntensity={audioIntensity} analyserData={analyserData} />
            </div>

          </div>
        </>
      )}
    </div>
  );
};

export default App;