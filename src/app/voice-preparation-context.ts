'use client';
import { createContext } from 'react';
import type { createVoicePreparationOwner } from '@/lib/voice-preparation-owner';
export const VoicePreparationContext = createContext<ReturnType<typeof createVoicePreparationOwner> | null>(null);
