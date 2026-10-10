import type { MainnetExecutionPreparation } from './mainnet-execution-coordinator';

export type ExtractMainnetReview = Extract<MainnetExecutionPreparation, { state: 'review-ready' }>;
