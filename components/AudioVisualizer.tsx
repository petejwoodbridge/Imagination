import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioIntensity: number;
  analyserData?: Uint8Array | null;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ audioIntensity, analyserData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyserData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear with slight fade trail effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, width, height);

    // Draw frequency bars
    const barWidth = width / analyserData.length;
    const barGap = 1;

    // Subtle color gradient based on intensity
    for (let i = 0; i < analyserData.length; i++) {
      const value = analyserData[i] / 255;
      
      // Height responsive to frequency
      const barHeight = (value * height) * 0.8;
      const x = i * barWidth;
      const y = height - barHeight;

      // Color changes subtly with intensity (white to red tint)
      const hue = 0; // Red
      const saturation = Math.min(audioIntensity * 30, 100);
      const lightness = 50 + audioIntensity * 20;
      
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      ctx.fillRect(x, y, barWidth - barGap, barHeight);

      // Subtle glow effect on peaks
      if (value > 0.6) {
        ctx.strokeStyle = `rgba(255, 100, 100, ${(value - 0.6) * audioIntensity * 2})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, barWidth - barGap, barHeight);
      }
    }
  }, [analyserData, audioIntensity]);

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Label */}
      <div className="text-[8px] uppercase tracking-widest text-white/40">
        AUDIO
      </div>
      
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={60}
        height={120}
        className="border border-white/20 bg-black/40 backdrop-blur-sm"
      />
      
      {/* Intensity meter */}
      <div className="w-full flex flex-col gap-1">
        <div className="w-12 h-1 bg-white/10 border border-white/20">
          <div
            className="h-full bg-gradient-to-r from-white/30 to-red-500/50 transition-all duration-100"
            style={{ width: `${audioIntensity * 100}%` }}
          />
        </div>
        <div className="text-[6px] text-white/30 text-right">
          {Math.round(audioIntensity * 100)}%
        </div>
      </div>
    </div>
  );
};

export default AudioVisualizer;
