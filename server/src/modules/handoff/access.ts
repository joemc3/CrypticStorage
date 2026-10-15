/** Rule states in which a named recipient may fetch the files. Kept apart so the files module can use it without a cycle. */
export const RELEASED_STATES_FOR_ACCESS = ['released_timer', 'released_quorum'] as const;
