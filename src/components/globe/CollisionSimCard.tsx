'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EncounterSummary, TelemetryRow } from '@/types/telemetry';

interface CollisionSimCardProps {
  encounter: EncounterSummary;
  /** Latest assessment for the encounter (relative position / velocity at TCA), if loaded */
  message: TelemetryRow | null;
  onClose: () => void;
}

const TIER_COLOR: Record<string, number> = {
  critical: 0xef4444,
  elevated: 0xfbbf24,
  safe: 0x10b981,
};

const TARGET_PASS_SECONDS = 2;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Relative geometry of the encounter in the satellite's RTN frame (metres, m/s):
 * the debris passes the satellite at position P (at TCA) moving with relative velocity V.
 * Falls back to a simple along-track pass at the reported miss distance if the vectors are missing.
 */
function encounterGeometry(enc: EncounterSummary, msg: TelemetryRow | null) {
  const miss = Math.max(enc.miss_distance, 1);
  const p = [num(msg?.relative_position_r), num(msg?.relative_position_t), num(msg?.relative_position_n)];
  const v = [num(msg?.relative_velocity_r), num(msg?.relative_velocity_t), num(msg?.relative_velocity_n)];
  const hasP = p.every((x) => x !== null);
  const hasV = v.every((x) => x !== null) && Math.hypot(...(v as number[])) > 0;
  const speed = num(msg?.relative_speed) ?? enc.relative_speed ?? 14000;

  const P = new THREE.Vector3(...(hasP ? (p as number[]) : [0, miss, 0]));
  const V = new THREE.Vector3(...(hasV ? (v as number[]) : [0, -speed, 0]));
  return { P, V, miss, speed: Math.max(V.length(), 1) };
}

export function CollisionSimCard({ encounter, message, onClose }: CollisionSimCardProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const rateRef = useRef(1);

  const [minimized, setMinimized] = useState(false);
  const [playing, setPlaying] = useState(true);
  // 'auto' plays every encounter so that its whole pass takes about TARGET_PASS_SECONDS of real time
  const [rate, setRate] = useState<'auto' | number>('auto');

  const latest = message && message.event_id === encounter.event_id ? message : null;
  const pc = encounter.predicted_pc ?? encounter.source_pc;
  const geom = encounterGeometry(encounter, latest);
  // Simulated seconds for the whole pass (same path length as the scene uses)
  const passSeconds = (2 * Math.max(2 * geom.miss, 1000)) / geom.speed;
  const effectiveRate = rate === 'auto' ? passSeconds / TARGET_PASS_SECONDS : rate;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    rateRef.current = effectiveRate;
  }, [effectiveRate]);

  // Each new encounter starts from the beginning at the default (auto) speed
  useEffect(() => {
    setRate('auto');
    setPlaying(true);
    progressRef.current = 0;
  }, [encounter.event_id]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || minimized) return;

    const { P, V, miss, speed } = encounterGeometry(encounter, latest);

    // Scene units: the path is +-4 units long; objects are exaggerated so they are visible
    const halfPath = Math.max(2 * miss, 1000); // metres either side of closest approach
    const s = 4 / halfPath;
    const duration = (2 * halfPath) / speed; // simulated seconds for the whole pass
    const dir = V.clone().normalize();
    // Closest point on the relative path to the satellite, and the path through it
    const tca = -P.dot(dir); // distance along dir (m) from P to the closest point
    const closest = P.clone().addScaledVector(dir, tca);
    const toScene = (m: THREE.Vector3) => new THREE.Vector3(m.y * s, m.x * s, m.z * s); // x=T, y=R, z=N
    const start = toScene(closest.clone().addScaledVector(dir, -halfPath));
    const end = toScene(closest.clone().addScaledVector(dir, halfPath));
    const closestScene = toScene(closest);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030a14);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(6.5, 4, 7.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 20;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 8, 4);
    scene.add(sun);

    // Stars
    const starPos: number[] = [];
    for (let i = 0; i < 400; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20);
      starPos.push(v.x, v.y, v.z);
    }
    const starGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x9fb4d0, size: 0.12 })));

    // RTN axes at the satellite (R up, T along-track, N cross-track)
    const axis = (to: THREE.Vector3, color: number) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
    };
    scene.add(axis(new THREE.Vector3(0, 1.4, 0), 0x60a5fa)); // R
    scene.add(axis(new THREE.Vector3(1.4, 0, 0), 0xf472b6)); // T
    scene.add(axis(new THREE.Vector3(0, 0, 1.4), 0x34d399)); // N

    // Satellite (at the origin)
    const tierColor = TIER_COLOR[encounter.operational_tier] ?? 0x94a3b8;
    const satellite = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8dee9, metalness: 0.6, roughness: 0.4 });
    const panelMat = new THREE.MeshStandardMaterial({ color: tierColor, metalness: 0.3, roughness: 0.5 });
    satellite.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.46), bodyMat));
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.9), panelMat);
      panel.position.set(side * 0.55, 0, 0);
      satellite.add(panel);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), bodyMat);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(side * 0.3, 0, 0);
      satellite.add(boom);
    }
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), bodyMat);
    dish.position.set(0, 0.28, 0);
    satellite.add(dish);
    scene.add(satellite);

    // Debris: lumpy rock
    const debrisGeo = new THREE.IcosahedronGeometry(0.26, 1);
    const pos = debrisGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898));
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    debrisGeo.computeVertexNormals();
    const debris = new THREE.Mesh(
      debrisGeo,
      new THREE.MeshStandardMaterial({ color: 0x8b8f98, roughness: 0.9, flatShading: true })
    );
    scene.add(debris);

    // Debris path, closest-approach marker and the miss-distance line
    const pathGeo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const path = new THREE.Line(
      pathGeo,
      new THREE.LineDashedMaterial({ color: 0xf5f7fa, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.6 })
    );
    path.computeLineDistances();
    scene.add(path);
    const missGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), closestScene]);
    scene.add(new THREE.Line(missGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24 })));
    const ringGeo = new THREE.RingGeometry(0.16, 0.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(closestScene);
    scene.add(ring);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      if (playingRef.current) {
        // `rate` is simulated seconds per wall second; pause briefly at the end of each pass
        progressRef.current += (dt * rateRef.current) / duration;
        if (progressRef.current > 1.15) progressRef.current = 0;
      }
      const u = Math.min(1, progressRef.current);
      debris.position.lerpVectors(start, end, u);
      debris.rotation.x += dt * 2.2;
      debris.rotation.y += dt * 1.4;
      satellite.rotation.y += dt * 0.25;

      // Pulse the closest-approach ring as the debris passes
      const near = Math.max(0, 1 - Math.abs(u - 0.5) * 8); // closest approach is the middle of the path
      ring.scale.setScalar(1 + near * 0.8);
      ring.lookAt(camera.position);

      if (sliderRef.current && playingRef.current) sliderRef.current.value = String(u);
      if (clockRef.current) {
        const t = (u - 0.5) * duration + tca / speed; // seconds relative to TCA
        clockRef.current.textContent = `T ${t >= 0 ? '+' : '−'} ${Math.abs(t).toFixed(2)} s`;
      }

      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      [starGeo, debrisGeo, pathGeo, missGeo, ringGeo].forEach((g) => g.dispose());
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Rebuild the scene when the encounter or its loaded vectors change
  }, [encounter.event_id, latest, minimized]); // eslint-disable-line react-hooks/exhaustive-deps

  const tierText =
    encounter.operational_tier === 'critical'
      ? 'text-[#EF4444]'
      : encounter.operational_tier === 'elevated'
      ? 'text-[#FBBF24]'
      : 'text-[#10B981]';

  return (
    <div className="absolute top-12 left-2 z-30 w-[340px] max-w-[90vw] bg-[#0B1E35] border border-[#243B55] rounded-xl shadow-2xl text-xs overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#243B55]">
        <div className="min-w-0">
          <span className="text-[#A8B6CB] text-[10px] block">CLOSE-APPROACH SIMULATION</span>
          <span className="font-bold text-[#F5F7FA] truncate block">
            {encounter.event_id} <span className={tierText}>{encounter.operational_tier.toUpperCase()}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setMinimized((m) => !m)}
            className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold leading-none"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? '+' : '−'}
          </button>
          <button
            onClick={onClose}
            className="text-[#A8B6CB] hover:text-[#F5F7FA] text-lg font-bold leading-none"
            title="Close"
          >
            &times;
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="relative">
            <div ref={mountRef} className="w-full h-[220px] cursor-grab active:cursor-grabbing" />
            <span ref={clockRef} className="absolute top-2 left-2 font-mono text-[11px] text-[#F5F7FA] pointer-events-none" />
            <div className="absolute bottom-2 left-2 text-[10px] text-[#A8B6CB] pointer-events-none">
              <span className="text-[#60a5fa]">R</span> radial &middot; <span className="text-[#f472b6]">T</span> along-track &middot;{' '}
              <span className="text-[#34d399]">N</span> cross-track
            </div>
            {!latest && (
              <div className="absolute top-2 right-2 text-[10px] text-[#A8B6CB]">loading geometry&hellip;</div>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-2 border-t border-[#243B55]">
            <button
              onClick={() => {
                if (progressRef.current >= 1) progressRef.current = 0;
                setPlaying((p) => !p);
              }}
              className="px-2 py-1 bg-[#061426] border border-[#243B55] rounded text-[#F5F7FA] hover:border-[#245BFF]"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              onClick={() => {
                progressRef.current = 0;
                setPlaying(true);
              }}
              className="px-2 py-1 bg-[#061426] border border-[#243B55] rounded text-[#A8B6CB] hover:border-[#A8B6CB]"
            >
              Replay
            </button>
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={1}
              step={0.001}
              defaultValue={0}
              onInput={(e) => {
                progressRef.current = Number((e.target as HTMLInputElement).value);
                setPlaying(false);
              }}
              className="flex-1 min-w-0 accent-[#245BFF]"
            />
            <select
              value={rate}
              onChange={(e) => setRate(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
              className="bg-[#061426] border border-[#243B55] rounded px-1 py-1 text-[#F5F7FA]"
              title="Playback speed (1x = real time)"
            >
              <option value="auto">
                {TARGET_PASS_SECONDS}s pass ({passSeconds / TARGET_PASS_SECONDS >= 1 ? (passSeconds / TARGET_PASS_SECONDS).toFixed(1) : (passSeconds / TARGET_PASS_SECONDS).toPrecision(2)}x)
              </option>
              <option value={4}>4x</option>
              <option value={2}>2x</option>
              <option value={1}>1x</option>
              <option value={0.5}>0.5x</option>
              <option value={0.25}>0.25x</option>
              <option value={0.1}>0.1x</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2 px-3 pb-2 text-[11px]">
            <div>
              <span className="text-[#A8B6CB] block text-[10px]">MISS DISTANCE</span>
              <span className="text-[#F5F7FA] font-bold">
                {encounter.miss_distance >= 1000
                  ? `${(encounter.miss_distance / 1000).toFixed(2)} km`
                  : `${encounter.miss_distance.toFixed(0)} m`}
              </span>
            </div>
            <div>
              <span className="text-[#A8B6CB] block text-[10px]">REL. SPEED</span>
              <span className="text-[#F5F7FA] font-bold">{(geom.speed / 1000).toFixed(2)} km/s</span>
            </div>
            <div>
              <span className="text-[#A8B6CB] block text-[10px]">Pc</span>
              <span className="text-[#F5F7FA] font-bold">{pc !== null && pc !== undefined ? pc.toExponential(1) : 'N/A'}</span>
            </div>
          </div>

          <p className="px-3 pb-3 text-[10px] leading-relaxed text-[#A8B6CB]">
            Built from this encounter&apos;s real relative position and velocity at closest approach. Objects are drawn far
            larger than life and the path is scaled to the miss distance. At these distances the objects miss each other; a
            collision is what the Pc estimates, not what is shown.
          </p>
        </>
      )}
    </div>
  );
}
