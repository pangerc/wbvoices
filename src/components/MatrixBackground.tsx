"use client";

import React, { useEffect, useRef, useCallback } from "react";

interface MatrixBackgroundProps {
  isAnimating?: boolean;
  className?: string;
}

export function MatrixBackground({
  isAnimating = false,
  className = "",
}: MatrixBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number>(0);

  // Grid configuration
  const DOT_SIZE = 6;
  const GAP_SIZE = 6;
  const CELL_SIZE = DOT_SIZE + GAP_SIZE;

  // Animation state
  const gridRef = useRef<number[][]>([]);
  const lastUpdateTimeRef = useRef(0);
  const animationSpeed = 80; // Animation step interval in ms

  // Cellular Automata Rules
  const MAX_GENERATION_CHANCE = 0.75;
  const PROPAGATION_CHANCE = 0.95;
  const MAX_LIFESPAN_COLS = 0.3;
  const WARMUP_DURATION = 1500; // 1.5 seconds for the generation to ramp up

  // Function to determine the chance of a pixel dying based on its horizontal position
  const getDecayChance = (gridX: number, cols: number) => {
    const lifePercentage = gridX / (cols * MAX_LIFESPAN_COLS);
    if (lifePercentage > 1) return 1; // Certain death past the max lifespan
    return Math.pow(lifePercentage, 2); // Decay accelerates over time (exponentially)
  };

  // Function to get the current generation chance based on the warmup
  const getCurrentGenerationChance = (elapsedTime: number) => {
    if (elapsedTime > WARMUP_DURATION) {
      return MAX_GENERATION_CHANCE;
    }
    // Linearly ramp up the chance from 0 to max over the warmup duration
    return (elapsedTime / WARMUP_DURATION) * MAX_GENERATION_CHANCE;
  };

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    // Get the canvas container dimensions
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || window.innerWidth;
    canvas.height = rect.height || window.innerHeight;

    const cols = Math.floor(canvas.width / CELL_SIZE);
    const rows = Math.floor(canvas.height / CELL_SIZE);

    // Initialize the grid with "off" cells
    gridRef.current = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(0));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateGrid = (elapsedTime: number) => {
    const grid = gridRef.current;
    if (!grid.length) return;

    const rows = grid.length;
    const cols = grid[0].length;
    const nextGrid = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(0));
    const currentGenChance = getCurrentGenerationChance(elapsedTime);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const currentState = grid[y][x];

        // 1. Spontaneous Generation on the left edge (with warmup)
        if (x === 0) {
          if (Math.random() < currentGenChance) {
            nextGrid[y][x] = Math.random() * 0.5 + 0.5; // New pixel with random opacity
          }
        } else {
          // 2. Propagation from the left neighbor
          const leftState = grid[y][x - 1];
          if (leftState > 0 && Math.random() < PROPAGATION_CHANCE) {
            nextGrid[y][x] = leftState * 0.98; // Propagate with slight dimming
          }
        }

        // 3. Decay
        if (currentState > 0 && Math.random() < getDecayChance(x, cols)) {
          nextGrid[y][x] = 0; // The pixel dies
        }
      }
    }
    gridRef.current = nextGrid;
  };

  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    const grid = gridRef.current;
    if (!canvas || !grid.length) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const rows = grid.length;
    const cols = grid[0].length;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const opacity = grid[y][x];
        if (opacity > 0) {
          const screenX = x * CELL_SIZE;
          const screenY = y * CELL_SIZE;
          ctx.fillStyle = `rgba(178, 211, 255, ${opacity * 0.5})`; // #B2D3FF in RGBA
          ctx.fillRect(screenX, screenY, DOT_SIZE, DOT_SIZE);
        }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const precalculateInitialState = useCallback(() => {
    const steps = Math.ceil(3000 / animationSpeed); // Calculate how many updates are in 3 seconds
    let simulatedElapsedTime = 0;
    for (let i = 0; i < steps; i++) {
      simulatedElapsedTime += animationSpeed;
      updateGrid(simulatedElapsedTime);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create a ref to track the current animating state
  const isAnimatingRef = useRef(isAnimating);
  isAnimatingRef.current = isAnimating;

  const animate = useCallback(
    (timestamp: number) => {
      const elapsedTime = timestamp - startTimeRef.current;

      if (isAnimatingRef.current) {
        const deltaTime = timestamp - lastUpdateTimeRef.current;

        if (deltaTime > animationSpeed) {
          updateGrid(elapsedTime);
          drawGrid();
          lastUpdateTimeRef.current = timestamp;
        }

        // Continue animation loop only if still animating
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Stop the animation loop when isAnimating becomes false
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawGrid]
  );

  // Initialize the animation on mount
  useEffect(() => {
    // Setup canvas
    setup();

    // Pre-calculate the initial state (3 seconds worth of animation)
    precalculateInitialState();

    // Draw the pre-calculated state immediately (frozen state)
    drawGrid();

    // Set the effective start time to 3 seconds ago, so when we unfreeze, the warmup is already over
    startTimeRef.current = performance.now() - 3000;
    lastUpdateTimeRef.current = performance.now();

    // Start the animation loop (will be paused initially since isAnimating is false)
    animationRef.current = requestAnimationFrame(animate);

    // Handle window resize
    const handleResize = () => {
      setup();
      precalculateInitialState();
      drawGrid();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [animate, drawGrid, precalculateInitialState, setup]);

  // Restart animation when isAnimating becomes true
  useEffect(() => {
    if (isAnimating) {
      // Cancel any existing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      // Always restart when isAnimating becomes true
      lastUpdateTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isAnimating, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        zIndex: 0,
        width: "100%",
        height: "100%",
      }}
    />
  );
}
