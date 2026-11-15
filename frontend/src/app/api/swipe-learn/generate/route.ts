import { handleSwipeLearnGenerate } from 'fe-apis/swipeLearn';

// nextjs-api twin of POST /swipe-learn/generate (backend/modules/swipe_learn). See fe-apis/swipeLearn.
// The AI call may take up to 240s for a slow model writing ten cards.
export const maxDuration = 300;

export const POST = handleSwipeLearnGenerate;
