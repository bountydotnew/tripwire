import { useEffect, useRef, useState, useCallback } from "react";

const PLAYER_W = 32;
const PLAYER_H = 16;
const BULLET_W = 2;
const BULLET_H = 8;
const INVADER_W = 24;
const INVADER_H = 16;
const INVADER_COLS = 8;
const INVADER_ROWS = 4;
const INVADER_GAP_X = 14;
const INVADER_GAP_Y = 12;
const INVADER_SPEED_BASE = 0.5;
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 3;
const SHOOT_COOLDOWN = 180;
const ENEMY_SHOOT_INTERVAL = 1000;

const GREEN = "#A7EF9E";
const GREEN_DIM = "rgba(167, 239, 158, 0.25)";
const GREEN_MID = "rgba(167, 239, 158, 0.5)";
const RED = "#F56D5D";

interface Entity { x: number; y: number; w: number; h: number; alive: boolean }
interface Bullet extends Entity { dy: number }

function createInvaders(w: number): Entity[] {
	const invaders: Entity[] = [];
	const totalW = INVADER_COLS * (INVADER_W + INVADER_GAP_X) - INVADER_GAP_X;
	const startX = (w - totalW) / 2;
	for (let row = 0; row < INVADER_ROWS; row++) {
		for (let col = 0; col < INVADER_COLS; col++) {
			invaders.push({
				x: startX + col * (INVADER_W + INVADER_GAP_X),
				y: 80 + row * (INVADER_H + INVADER_GAP_Y),
				w: INVADER_W, h: INVADER_H, alive: true,
			});
		}
	}
	return invaders;
}

function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number) {
	ctx.fillStyle = GREEN;
	ctx.fillRect(x + 12, y, 8, 4);
	ctx.fillRect(x + 8, y + 4, 16, 4);
	ctx.fillRect(x + 4, y + 8, 24, 4);
	ctx.fillRect(x, y + 12, 32, 4);
	ctx.fillRect(x + 15, y - 4, 2, 4);
}

function drawInvader(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
	ctx.fillStyle = GREEN;
	if (frame % 2 === 0) {
		ctx.fillRect(x + 8, y, 8, 4);
		ctx.fillRect(x + 4, y + 4, 16, 4);
		ctx.fillRect(x, y + 8, 24, 4);
		ctx.fillRect(x + 4, y + 12, 4, 4);
		ctx.fillRect(x + 16, y + 12, 4, 4);
	} else {
		ctx.fillRect(x + 8, y, 8, 4);
		ctx.fillRect(x + 4, y + 4, 16, 4);
		ctx.fillRect(x, y + 8, 24, 4);
		ctx.fillRect(x, y + 12, 4, 4);
		ctx.fillRect(x + 20, y + 12, 4, 4);
	}
}

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
	ctx.fillStyle = t > 0.5 ? GREEN_DIM : GREEN;
	const s = 4 + t * 14;
	const cx = x + 12;
	const cy = y + 8;
	for (let i = 0; i < 8; i++) {
		const angle = (i / 8) * Math.PI * 2;
		ctx.fillRect(cx + Math.cos(angle) * s - 1, cy + Math.sin(angle) * s - 1, 2, 2);
	}
}

// The game renders to an offscreen canvas that gets fed into FaultyTerminal's shader as a texture.
// No visible DOM element — the terminal IS the display.
export function useSpaceInvaders(active: boolean, onExit: () => void): HTMLCanvasElement | null {
	const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const stateRef = useRef<{
		w: number; h: number;
		player: { x: number; y: number };
		invaders: Entity[];
		bullets: Bullet[];
		enemyBullets: Bullet[];
		explosions: { x: number; y: number; t: number }[];
		keys: Set<string>;
		invaderDir: number;
		invaderSpeed: number;
		animFrame: number;
		frameCount: number;
		lastShot: number;
		lastEnemyShot: number;
		score: number;
		lives: number;
		gameOver: boolean;
		wave: number;
	} | null>(null);

	const resetWave = useCallback(() => {
		const s = stateRef.current;
		if (!s) return;
		s.invaders = createInvaders(s.w);
		s.enemyBullets = [];
		s.invaderDir = 1;
		s.invaderSpeed = INVADER_SPEED_BASE + (s.wave - 1) * 0.15;
		s.animFrame = 0;
	}, []);

	useEffect(() => {
		if (!active) {
			canvasRef.current = null;
			stateRef.current = null;
			setCanvas(null);
			return;
		}

		const W = window.innerWidth;
		const H = window.innerHeight;
		const c = document.createElement("canvas");
		c.width = W;
		c.height = H;
		canvasRef.current = c;
		setCanvas(c);
		const ctx = c.getContext("2d")!;

		const s = {
			w: W, h: H,
			player: { x: W / 2 - PLAYER_W / 2, y: H - 80 },
			invaders: createInvaders(W),
			bullets: [] as Bullet[],
			enemyBullets: [] as Bullet[],
			explosions: [] as { x: number; y: number; t: number }[],
			keys: new Set<string>(),
			invaderDir: 1,
			invaderSpeed: INVADER_SPEED_BASE,
			animFrame: 0,
			frameCount: 0,
			lastShot: 0,
			lastEnemyShot: 0,
			score: 0,
			lives: 3,
			gameOver: false,
			wave: 1,
		};
		stateRef.current = s;

		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") { onExit(); return; }
			s.keys.add(e.key);
			if (e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
		};
		const onKeyUp = (e: KeyboardEvent) => s.keys.delete(e.key);
		window.addEventListener("keydown", onKey);
		window.addEventListener("keyup", onKeyUp);

		let raf: number;
		const loop = () => {
			raf = requestAnimationFrame(loop);
			s.frameCount++;

			ctx.clearRect(0, 0, W, H);

			if (s.gameOver) {
				ctx.fillStyle = GREEN;
				ctx.font = "bold 28px Geist, system-ui, monospace";
				ctx.textAlign = "center";
				ctx.fillText("GAME OVER", W / 2, H / 2 - 30);
				ctx.font = "16px Geist, system-ui, monospace";
				ctx.fillStyle = GREEN_MID;
				ctx.fillText(`Score: ${s.score}  ·  Wave: ${s.wave}`, W / 2, H / 2 + 5);
				ctx.font = "13px Geist, system-ui, monospace";
				ctx.fillStyle = GREEN_DIM;
				ctx.fillText("SPACE to restart  ·  ESC to exit", W / 2, H / 2 + 35);
				if (s.keys.has(" ")) {
					s.score = 0; s.lives = 3; s.wave = 1;
					s.player.x = W / 2 - PLAYER_W / 2;
					s.bullets = []; s.gameOver = false;
					resetWave();
				}
				return;
			}

			const spd = 5;
			if (s.keys.has("ArrowLeft")) s.player.x = Math.max(0, s.player.x - spd);
			if (s.keys.has("ArrowRight")) s.player.x = Math.min(W - PLAYER_W, s.player.x + spd);

			const now = performance.now();
			if (s.keys.has(" ") && now - s.lastShot > SHOOT_COOLDOWN) {
				s.lastShot = now;
				s.bullets.push({
					x: s.player.x + PLAYER_W / 2 - BULLET_W / 2,
					y: s.player.y - BULLET_H,
					w: BULLET_W, h: BULLET_H, alive: true, dy: -BULLET_SPEED,
				});
			}

			for (const b of s.bullets) { b.y += b.dy; if (b.y < -10) b.alive = false; }
			for (const b of s.enemyBullets) { b.y += b.dy; if (b.y > H + 10) b.alive = false; }
			s.bullets = s.bullets.filter((b) => b.alive);
			s.enemyBullets = s.enemyBullets.filter((b) => b.alive);

			let hitEdge = false;
			const alive = s.invaders.filter((i) => i.alive);
			for (const inv of alive) {
				inv.x += s.invaderDir * s.invaderSpeed;
				if (inv.x <= 10 || inv.x + inv.w >= W - 10) hitEdge = true;
			}
			if (hitEdge) {
				s.invaderDir *= -1;
				for (const inv of alive) inv.y += 10;
			}
			if (s.frameCount % 25 === 0) s.animFrame++;

			if (now - s.lastEnemyShot > ENEMY_SHOOT_INTERVAL && alive.length > 0) {
				s.lastEnemyShot = now;
				const shooter = alive[Math.floor(Math.random() * alive.length)];
				s.enemyBullets.push({
					x: shooter.x + shooter.w / 2 - 1, y: shooter.y + shooter.h,
					w: 2, h: 6, alive: true, dy: ENEMY_BULLET_SPEED,
				});
			}

			for (const b of s.bullets) {
				for (const inv of s.invaders) {
					if (!inv.alive || !b.alive) continue;
					if (b.x < inv.x + inv.w && b.x + b.w > inv.x && b.y < inv.y + inv.h && b.y + b.h > inv.y) {
						b.alive = false; inv.alive = false;
						s.score += 10;
						s.explosions.push({ x: inv.x, y: inv.y, t: 0 });
					}
				}
			}

			for (const b of s.enemyBullets) {
				if (b.x < s.player.x + PLAYER_W && b.x + b.w > s.player.x &&
					b.y < s.player.y + PLAYER_H && b.y + b.h > s.player.y) {
					b.alive = false; s.lives--;
					if (s.lives <= 0) s.gameOver = true;
				}
			}

			for (const inv of alive) {
				if (inv.y + inv.h >= s.player.y) s.gameOver = true;
			}

			if (alive.length === 0) { s.wave++; resetWave(); }

			s.explosions = s.explosions.filter((e) => { e.t += 0.04; return e.t < 1; });

			drawPlayer(ctx, s.player.x, s.player.y);
			for (const inv of s.invaders) {
				if (inv.alive) drawInvader(ctx, inv.x, inv.y, s.animFrame);
			}
			ctx.fillStyle = GREEN;
			for (const b of s.bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
			ctx.fillStyle = RED;
			for (const b of s.enemyBullets) ctx.fillRect(b.x, b.y, b.w, b.h);
			for (const e of s.explosions) drawExplosion(ctx, e.x, e.y, e.t);

			ctx.fillStyle = GREEN;
			ctx.font = "13px Geist, system-ui, monospace";
			ctx.textAlign = "left";
			ctx.fillText(`SCORE ${s.score}`, 20, 40);
			ctx.textAlign = "right";
			ctx.fillText(`WAVE ${s.wave}`, W - 20, 40);
			ctx.textAlign = "center";
			for (let i = 0; i < s.lives; i++) {
				ctx.fillRect(W / 2 - 20 + i * 14, 32, 8, 8);
			}
			ctx.fillStyle = GREEN_DIM;
			ctx.font = "10px Geist, system-ui, monospace";
			ctx.fillText("ARROWS move  ·  SPACE shoot  ·  ESC exit", W / 2, H - 16);
		};

		raf = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("keyup", onKeyUp);
			canvasRef.current = null;
			stateRef.current = null;
			setCanvas(null);
		};
	}, [active, onExit, resetWave]);

	return canvas;
}
