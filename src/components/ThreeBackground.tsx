"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Dimensions
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.z = 250;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    // Lights (required for crystal shading)
    const ambientLight = new THREE.AmbientLight(0x120924, 1.5);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x8354EC, 2.5, 400);
    pointLight1.position.set(100, 100, 100);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x6E54FF, 2, 400);
    pointLight2.position.set(-100, -100, 50);
    scene.add(pointLight2);

    // 1. Particle Cloud
    const particleCount = 150;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const colorPalette = [
      new THREE.Color("#8354EC"),
      new THREE.Color("#6E54FF"),
      new THREE.Color("#C4B5FD"),
      new THREE.Color("#FFFFFF")
    ];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 300;

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    // Particle Texture
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.3, "rgba(200,200,255,0.8)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 16);
    }
    const texture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      size: 4,
      vertexColors: true,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // 2. Floating Crystals (matching the mascot's environment)
    const crystals: THREE.Mesh[] = [];
    const crystalColors = [0x8354EC, 0x6E54FF, 0x3A236E];

    for (let i = 0; i < 8; i++) {
      // Create a double cone / octahedron representing raw purple crystals
      const geom = new THREE.ConeGeometry(8, 20, 4); // 4-sided cone
      const mat = new THREE.MeshPhongMaterial({
        color: crystalColors[i % crystalColors.length],
        emissive: 0x120924,
        shininess: 120,
        flatShading: true, // gives it a low-poly crystal facet look
        transparent: true,
        opacity: 0.85
      });

      // Construct a double cone for a diamond/crystal shape
      const crystalGroup = new THREE.Group();
      const topCone = new THREE.Mesh(geom, mat);
      const bottomCone = new THREE.Mesh(geom, mat);
      bottomCone.rotation.x = Math.PI; // flip it upside down
      
      crystalGroup.add(topCone);
      crystalGroup.add(bottomCone);

      // Random position
      crystalGroup.position.set(
        (Math.random() - 0.5) * 350,
        (Math.random() - 0.5) * 250,
        (Math.random() - 0.5) * 150
      );

      // Random rotation
      crystalGroup.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        0
      );

      // Store individual rotation speeds
      crystalGroup.userData = {
        rotX: (Math.random() - 0.5) * 0.01,
        rotY: (Math.random() - 0.5) * 0.01,
        floatSpeed: 0.001 + Math.random() * 0.002,
        floatRange: 10 + Math.random() * 10,
        startY: crystalGroup.position.y
      };

      scene.add(crystalGroup);
      crystals.push(crystalGroup as any);
    }

    // 3. Dynamic Connections
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x241442,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });

    const lineGeometry = new THREE.BufferGeometry();
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSegments);

    // Mouse Tracking for Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      mouseX = (event.clientX - window.innerWidth / 2) * 0.08;
      mouseY = (event.clientY - window.innerHeight / 2) * 0.08;
    };

    window.addEventListener("mousemove", handleMouseMove);

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Rotate particle cloud
      particles.rotation.y += 0.0008;

      // Animate Crystals (Rotation + Hover float)
      crystals.forEach(c => {
        c.rotation.x += c.userData.rotX;
        c.rotation.y += c.userData.rotY;
        
        // Up-down floating motion
        c.position.y = c.userData.startY + Math.sin(elapsed * 2 * Math.PI * c.userData.floatSpeed) * c.userData.floatRange;
      });

      // Smooth camera parallax
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;
      camera.position.x = targetX;
      camera.position.y = -targetY;
      camera.lookAt(scene.position);

      // Connect close particles
      const positionsAttr = particles.geometry.attributes.position.array as Float32Array;
      const linePositions: number[] = [];
      const maxDistance = 60;

      const rotatedPositions: THREE.Vector3[] = [];
      const tempVec = new THREE.Vector3();
      
      for (let i = 0; i < particleCount; i++) {
        tempVec.set(
          positionsAttr[i * 3],
          positionsAttr[i * 3 + 1],
          positionsAttr[i * 3 + 2]
        );
        tempVec.applyEuler(particles.rotation);
        rotatedPositions.push(tempVec.clone());
      }

      for (let i = 0; i < particleCount; i++) {
        for (let j = i + 1; j < particleCount; j++) {
          const dist = rotatedPositions[i].distanceTo(rotatedPositions[j]);
          if (dist < maxDistance) {
            linePositions.push(rotatedPositions[i].x, rotatedPositions[i].y, rotatedPositions[i].z);
            linePositions.push(rotatedPositions[j].x, rotatedPositions[j].y, rotatedPositions[j].z);
          }
        }
      }

      lineSegments.geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(linePositions, 3)
      );
      lineSegments.geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener("resize", handleResize);

    // Clean up
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);

      if (mountRef.current && renderer.domElement) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        mountRef.current.removeChild(renderer.domElement);
      }

      // Dispose webgl resources
      particleGeometry.dispose();
      particleMaterial.dispose();
      texture.dispose();
      lineMaterial.dispose();
      lineGeometry.dispose();
      
      crystals.forEach(c => {
        c.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
      });

      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden"
      }}
    />
  );
}
