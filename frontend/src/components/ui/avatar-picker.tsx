"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, type Variants } from "motion/react";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface Avatar {
  id: number;
  svg: ReactNode;
  alt: string;
  dataUri: string;
}

const svgToDataUri = (svg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const avatarDefinitions = [
  {
    id: 1,
    svg: (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        aria-label="Avatar 1"
      >
        <mask
          id="avatar-one"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="36"
          height="36"
        >
          <rect width="36" height="36" rx="72" fill="#FFFFFF" />
        </mask>
        <g mask="url(#avatar-one)">
          <rect width="36" height="36" fill="#ff005b" />
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            transform="translate(9 -5) rotate(219 18 18) scale(1)"
            fill="#ffb238"
            rx="6"
          />
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path
              d="M15 19c2 1 4 1 6 0"
              stroke="#000000"
              fill="none"
              strokeLinecap="round"
            />
            <rect
              x="10"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#000000"
            />
            <rect
              x="24"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#000000"
            />
          </g>
        </g>
      </svg>
    ),
    alt: "Avatar 1",
    dataUri: svgToDataUri(
      `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" role="img"><mask id="avatar-one" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"/></mask><g mask="url(#avatar-one)"><rect width="36" height="36" fill="#ff005b"/><rect x="0" y="0" width="36" height="36" transform="translate(9 -5) rotate(219 18 18) scale(1)" fill="#ffb238" rx="6"/><g transform="translate(4.5 -4) rotate(9 18 18)"><path d="M15 19c2 1 4 1 6 0" stroke="#000000" fill="none" stroke-linecap="round"/><rect x="10" y="14" width="1.5" height="2" rx="1" fill="#000000"/><rect x="24" y="14" width="1.5" height="2" rx="1" fill="#000000"/></g></g></svg>`
    ),
  },
  {
    id: 2,
    svg: (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        aria-label="Avatar 2"
      >
        <mask
          id="avatar-two"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="36"
          height="36"
        >
          <rect width="36" height="36" rx="72" fill="#FFFFFF"></rect>
        </mask>
        <g mask="url(#avatar-two)">
          <rect width="36" height="36" fill="#ff7d10"></rect>
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            transform="translate(5 -1) rotate(55 18 18) scale(1.1)"
            fill="#0a0310"
            rx="6"
          />
          <g transform="translate(7 -6) rotate(-5 18 18)">
            <path
              d="M15 20c2 1 4 1 6 0"
              stroke="#FFFFFF"
              fill="none"
              strokeLinecap="round"
            />
            <rect
              x="14"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#FFFFFF"
            />
            <rect
              x="20"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#FFFFFF"
            />
          </g>
        </g>
      </svg>
    ),
    alt: "Avatar 2",
    dataUri: svgToDataUri(
      `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" role="img"><mask id="avatar-two" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"/></mask><g mask="url(#avatar-two)"><rect width="36" height="36" fill="#ff7d10"/><rect x="0" y="0" width="36" height="36" transform="translate(5 -1) rotate(55 18 18) scale(1.1)" fill="#0a0310" rx="6"/><g transform="translate(7 -6) rotate(-5 18 18)"><path d="M15 20c2 1 4 1 6 0" stroke="#FFFFFF" fill="none" stroke-linecap="round"/><rect x="14" y="14" width="1.5" height="2" rx="1" fill="#FFFFFF"/><rect x="20" y="14" width="1.5" height="2" rx="1" fill="#FFFFFF"/></g></g></svg>`
    ),
  },
  {
    id: 3,
    svg: (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        aria-label="Avatar 3"
      >
        <mask
          id="avatar-three"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="36"
          height="36"
        >
          <rect width="36" height="36" rx="72" fill="#FFFFFF"></rect>
        </mask>
        <g mask="url(#avatar-three)">
          <rect width="36" height="36" fill="#0a0310" />
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            transform="translate(-3 7) rotate(227 18 18) scale(1.2)"
            fill="#ff005b"
            rx="36"
          />
          <g transform="translate(-3 3.5) rotate(7 18 18)">
            <path d="M13,21 a1,0.75 0 0,0 10,0" fill="#FFFFFF" />
            <rect
              x="12"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#FFFFFF"
            />
            <rect
              x="22"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#FFFFFF"
            />
          </g>
        </g>
      </svg>
    ),
    alt: "Avatar 3",
    dataUri: svgToDataUri(
      `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" role="img"><mask id="avatar-three" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"/></mask><g mask="url(#avatar-three)"><rect width="36" height="36" fill="#0a0310"/><rect x="0" y="0" width="36" height="36" transform="translate(-3 7) rotate(227 18 18) scale(1.2)" fill="#ff005b" rx="36"/><g transform="translate(-3 3.5) rotate(7 18 18)"><path d="M13,21 a1,0.75 0 0,0 10,0" fill="#FFFFFF"/><rect x="12" y="14" width="1.5" height="2" rx="1" fill="#FFFFFF"/><rect x="22" y="14" width="1.5" height="2" rx="1" fill="#FFFFFF"/></g></g></svg>`
    ),
  },
  {
    id: 4,
    svg: (
      <svg
        viewBox="0 0 36 36"
        fill="none"
        role="img"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        aria-label="Avatar 4"
      >
        <mask
          id="avatar-four"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="36"
          height="36"
        >
          <rect width="36" height="36" rx="72" fill="#FFFFFF"></rect>
        </mask>
        <g mask="url(#avatar-four)">
          <rect width="36" height="36" fill="#d8fcb3"></rect>
          <rect
            x="0"
            y="0"
            width="36"
            height="36"
            transform="translate(9 -5) rotate(219 18 18) scale(1)"
            fill="#89fcb3"
            rx="6"
          ></rect>
          <g transform="translate(4.5 -4) rotate(9 18 18)">
            <path
              d="M15 19c2 1 4 1 6 0"
              stroke="#000000"
              fill="none"
              strokeLinecap="round"
            ></path>
            <rect
              x="10"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#000000"
            ></rect>
            <rect
              x="24"
              y="14"
              width="1.5"
              height="2"
              rx="1"
              stroke="none"
              fill="#000000"
            ></rect>
          </g>
        </g>
      </svg>
    ),
    alt: "Avatar 4",
    dataUri: svgToDataUri(
      `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" role="img"><mask id="avatar-four" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"/></mask><g mask="url(#avatar-four)"><rect width="36" height="36" fill="#d8fcb3"/><rect x="0" y="0" width="36" height="36" transform="translate(9 -5) rotate(219 18 18) scale(1)" fill="#89fcb3" rx="6"/><g transform="translate(4.5 -4) rotate(9 18 18)"><path d="M15 19c2 1 4 1 6 0" stroke="#000000" fill="none" stroke-linecap="round"/><rect x="10" y="14" width="1.5" height="2" rx="1" fill="#000000"/><rect x="24" y="14" width="1.5" height="2" rx="1" fill="#000000"/></g></g></svg>`
    ),
  },
] satisfies Avatar[];

// Add these animation variants at the top level
const mainAvatarVariants: Variants = {
  initial: {
    y: 20,
    opacity: 0,
  },
  animate: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 20,
    },
  },
  exit: {
    y: -20,
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

const pickerVariants: { container: Variants; item: Variants } = {
  container: {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  },
  item: {
    initial: {
      y: 20,
      opacity: 0,
    },
    animate: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 20,
      },
    },
  },
};

const selectedVariants: Variants = {
  initial: {
    opacity: 0,
    rotate: -180,
  },
  animate: {
    opacity: 1,
    rotate: 0,
    transition: {
      type: "spring",
      stiffness: 200,
      damping: 15,
    },
  },
  exit: {
    opacity: 0,
    rotate: 180,
    transition: {
      duration: 0.2,
    },
  },
};

type AvatarPickerProps = {
  value?: string | null;
  username?: string;
  onSelect?: (avatarUrl: string) => void;
};

export function AvatarPicker({ value, username, onSelect }: AvatarPickerProps) {
  const [rotationCount, setRotationCount] = useState(0);

  const avatars: Avatar[] = useMemo(() => avatarDefinitions, []);

  const [selectedAvatar, setSelectedAvatar] = useState<Avatar>(() => {
    const existing = avatars.find((avatar) => avatar.dataUri === value);
    return existing ?? avatars[0];
  });

  useEffect(() => {
    const found = avatars.find((avatar) => avatar.dataUri === value);
    if (found) {
      setSelectedAvatar(found);
    }
  }, [value, avatars]);

  const handleAvatarSelect = (avatar: Avatar) => {
    setRotationCount((prev) => prev + 1080); // Add 3 rotations each time
    setSelectedAvatar(avatar);
    onSelect?.(avatar.dataUri);
  };

  return (
    <motion.div initial="initial" animate="animate" className="w-full">
      <Card className="mx-auto w-full max-w-md overflow-hidden border-white/10 bg-gradient-to-b from-slate-900/70 to-slate-950/60 text-slate-50 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
        <CardContent className="p-0">
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{
              opacity: 1,
              height: "8rem",
              transition: {
                height: {
                  type: "spring",
                  stiffness: 100,
                  damping: 20,
                },
              },
            }}
            className="w-full bg-gradient-to-r from-cyan-400/20 via-emerald-300/15 to-indigo-400/15"
          />

          <div className="-mt-16 px-8 pb-8">
            <motion.div
              className="relative mx-auto flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-4 border-white/20 bg-slate-900"
              variants={mainAvatarVariants}
              layoutId="selectedAvatar"
            >
              <motion.div
                className="flex h-full w-full items-center justify-center scale-[3]"
                animate={{
                  rotate: rotationCount,
                }}
                transition={{
                  duration: 0.8,
                  ease: [0.4, 0, 0.2, 1],
                }}
              >
                {selectedAvatar.svg}
              </motion.div>
            </motion.div>

            <motion.div
              className="mt-4 text-center"
              variants={pickerVariants.item}
            >
              <motion.h2
                className="text-2xl font-bold text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {username || "Vous"}
              </motion.h2>
              <motion.p
                className="text-sm text-slate-300"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                Choisissez un avatar de base ou uploadez le vôtre.
              </motion.p>
            </motion.div>

            <motion.div className="mt-6" variants={pickerVariants.container}>
              <motion.div
                className="flex justify-center gap-4"
                variants={pickerVariants.container}
              >
                {avatars.map((avatar) => (
                  <motion.button
                    key={avatar.id}
                    onClick={() => handleAvatarSelect(avatar)}
                    className={cn(
                      "relative h-12 w-12 overflow-hidden rounded-full border-2 border-white/10 bg-slate-900/70 shadow-inner transition-all duration-300",
                      selectedAvatar.id === avatar.id && "shadow-[0_0_0_4px_rgba(16,185,129,0.35)]"
                    )}
                    variants={pickerVariants.item}
                    whileHover={{
                      y: -2,
                      transition: { duration: 0.2 },
                    }}
                    whileTap={{
                      y: 0,
                      transition: { duration: 0.2 },
                    }}
                    aria-label={`Sélectionner ${avatar.alt}`}
                    aria-pressed={selectedAvatar.id === avatar.id}
                    type="button"
                  >
                    <div className="flex h-full w-full items-center justify-center">
                      {avatar.svg}
                    </div>
                    {selectedAvatar.id === avatar.id && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-emerald-400/15 ring-2 ring-emerald-300 ring-offset-2 ring-offset-slate-950"
                        variants={selectedVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layoutId="selectedIndicator"
                      />
                    )}
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function DemoAvatarPicker() {
  return <AvatarPicker />;
}
