/**
 * DevOnboard - Organic Crème & Espresso Architectural Knowledge-Mesh
 * High-performance 60fps canvas with warm crème paper background,
 * espresso particle physics, cursor magnetic filaments, and evidence pulses.
 */

(function () {
  const canvas = document.getElementById('network-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = 0;
  let height = 0;
  let particles = [];
  let pulses = [];
  let ripples = [];
  let mouse = { x: -1000, y: -1000, radius: 180, isDown: false };

  const PARTICLE_COUNT = 60;
  const CONNECTION_DIST = 150;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = -1000;
    mouse.y = -1000;
  });
  window.addEventListener('mousedown', (e) => {
    mouse.isDown = true;
    ripples.push({
      x: e.clientX,
      y: e.clientY,
      radius: 10,
      maxRadius: 160,
      alpha: 0.25
    });
  });
  window.addEventListener('mouseup', () => {
    mouse.isDown = false;
  });

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.radius = Math.random() * 2.2 + 1.2;
      this.baseRadius = this.radius;

      // Palette: Deep Mocha, Saddle Leather, Radiant Bronze, Warm Cognac Amber
      const colors = [
        'rgba(36, 26, 18, ',    // Deep Mocha
        'rgba(141, 91, 54, ',   // Saddle Brown
        'rgba(196, 120, 68, ',  // Radiant Bronze
        'rgba(217, 145, 56, '   // Cognac Amber
      ];
      this.colorBase = colors[Math.floor(Math.random() * colors.length)];
      this.alpha = Math.random() * 0.45 + 0.35;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;

      // Interactive mouse physics
      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < mouse.radius) {
        const force = (mouse.radius - dist) / mouse.radius;
        this.x -= (dx / dist) * force * 1.8;
        this.y -= (dy / dist) * force * 1.8;
        this.radius = this.baseRadius * (1 + force * 1.3);
      } else {
        this.radius = this.baseRadius;
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.colorBase + this.alpha + ')';
      ctx.fill();
    }
  }

  class Pulse {
    constructor(p1, p2) {
      this.p1 = p1;
      this.p2 = p2;
      this.progress = 0;
      this.speed = Math.random() * 0.018 + 0.012;
      this.color = Math.random() > 0.5 ? '#D99138' : '#C47844';
      this.alive = true;
    }

    update() {
      this.progress += this.speed;
      if (this.progress >= 1) {
        this.alive = false;
      }
    }

    draw() {
      const curX = this.p1.x + (this.p2.x - this.p1.x) * this.progress;
      const curY = this.p1.y + (this.p2.y - this.p1.y) * this.progress;

      ctx.beginPath();
      ctx.arc(curX, curY, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = this.color;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function init() {
    resize();
    particles = [];
    pulses = [];
    ripples = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }
  }

  let lastPulseTime = 0;

  function animate(now) {
    const isLight = document.body.classList.contains('theme-light') || (!document.body.classList.contains('theme-dark') && document.body.classList.contains('theme-creme'));

    // 1. Draw theme-adaptive background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (isLight) {
      bgGrad.addColorStop(0, '#FAF7F2');
      bgGrad.addColorStop(0.5, '#F5F1E8');
      bgGrad.addColorStop(1, '#EFEAE0');
    } else {
      // Dark Mode: Deep Black & Gradient Warm Mocha Brown
      bgGrad.addColorStop(0, '#080706');
      bgGrad.addColorStop(0.35, '#120d09');
      bgGrad.addColorStop(0.75, '#0b0907');
      bgGrad.addColorStop(1, '#050403');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw subtle architectural dot matrix
    ctx.fillStyle = isLight ? 'rgba(85, 55, 35, 0.035)' : 'rgba(196, 120, 68, 0.04)';
    const dotSpacing = 36;
    for (let x = 18; x < width; x += dotSpacing) {
      for (let y = 18; y < height; y += dotSpacing) {
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }

    // 3. Draw and update click ripples
    for (let r = ripples.length - 1; r >= 0; r--) {
      const rip = ripples[r];
      rip.radius += 3.5;
      rip.alpha -= 0.007;
      if (rip.alpha <= 0) {
        ripples.splice(r, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.strokeStyle = isLight ? `rgba(141, 91, 54, ${rip.alpha})` : `rgba(196, 120, 68, ${rip.alpha * 0.9})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // 4. Update and connect particles
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();

      // Mouse connection filaments
      const mdx = mouse.x - particles[i].x;
      const mdy = mouse.y - particles[i].y;
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mdist < 140) {
        const mAlpha = (1 - mdist / 140) * 0.28;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = isLight ? `rgba(141, 91, 54, ${mAlpha})` : `rgba(196, 120, 68, ${mAlpha})`;
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // Inter-particle edges
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < CONNECTION_DIST) {
          const alpha = (1 - dist / CONNECTION_DIST) * 0.18;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = isLight ? `rgba(90, 60, 40, ${alpha})` : `rgba(180, 105, 50, ${alpha * 0.9})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();

          // Spawn pulses along edges
          if (now - lastPulseTime > 750 && Math.random() < 0.035 && pulses.length < 8) {
            pulses.push(new Pulse(particles[i], particles[j]));
            lastPulseTime = now;
          }
        }
      }
    }

    // 5. Draw pulses
    for (let k = pulses.length - 1; k >= 0; k--) {
      pulses[k].update();
      pulses[k].draw();
      if (!pulses[k].alive) {
        pulses.splice(k, 1);
      }
    }

    requestAnimationFrame(animate);
  }

  init();
  requestAnimationFrame(animate);
})();
