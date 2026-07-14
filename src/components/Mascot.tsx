"use client";

import React from "react";

export type MascotPose = 
  | "MAIN" 
  | "LETSGO" 
  | "FOCUS" 
  | "PLAN" 
  | "NICE" 
  | "TRACK" 
  | "BUILD" 
  | "WIN" 
  | "REFLECT";

interface MascotProps {
  pose: MascotPose;
  size?: number; // target width/height bounding box
  className?: string;
  style?: React.CSSProperties;
}

const POSES = {
  MAIN: { x: 20, y: 120, w: 460, h: 760 },
  LETSGO: { x: 490, y: 395, w: 120, h: 175 },
  FOCUS: { x: 615, y: 395, w: 120, h: 175 },
  PLAN: { x: 740, y: 395, w: 120, h: 175 },
  NICE: { x: 865, y: 395, w: 125, h: 175 },
  TRACK: { x: 450, y: 590, w: 160, h: 200 },
  BUILD: { x: 615, y: 590, w: 120, h: 200 },
  WIN: { x: 735, y: 590, w: 130, h: 200 },
  REFLECT: { x: 855, y: 590, w: 155, h: 200 },
};

export default function Mascot({ pose, size = 100, className = "", style = {} }: MascotProps) {
  const config = POSES[pose] || POSES.MAIN;
  
  // Calculate scale factor to match the requested size
  // We scale based on the width of the crop
  const scale = size / config.w;
  const height = config.h * scale;

  return (
    <div 
      className={className}
      style={{
        width: `${size}px`,
        height: `${height}px`,
        overflow: "hidden",
        position: "relative",
        display: "inline-block",
        flexShrink: 0,
        ...style
      }}
    >
      <div 
        style={{
          width: "1024px",
          height: "1024px",
          backgroundImage: "url('/mascot_sheet.jpg')",
          backgroundSize: "1024px 1024px",
          backgroundPosition: `-${config.x}px -${config.y}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          position: "absolute",
          top: 0,
          left: 0,
          pointerEvents: "none"
        }}
      />
    </div>
  );
}
