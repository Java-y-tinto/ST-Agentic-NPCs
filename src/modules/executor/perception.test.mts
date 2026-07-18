// Run: node --experimental-strip-types src/modules/executor/perception.test.mts
import assert from 'node:assert';
import { buildPerceptionPrompt, parsePerceptionText, validatePerception, type PerceptionPayload } from './perception.ts';

const payload: PerceptionPayload = {
    npcs: [
        { npcId: 'mira', name: 'Mira', location: 'The Forge', activity: 'smithing' },
        { npcId: 'tomas', name: 'Tomas', location: 'The Inn' },
    ],
    userMessage: 'I walk into the forge and greet Mira',
    botMessage: 'Mira looks up from the anvil and nods.',
    timeGt: 'd3 14:05',
};

// Prompt mentions every NPC and the exchange.
const prompt = buildPerceptionPrompt(payload, false);
assert.ok(prompt.includes('mira') && prompt.includes('tomas') && prompt.includes('The Forge'));
assert.ok(buildPerceptionPrompt(payload, true).includes('yes|no'));

// Text-mode parsing tolerates bullets and case.
assert.deepEqual(parsePerceptionText('mira: Yes\n- tomas: no\nnoise line'), {
    results: [{ npcId: 'mira', perceived: true }, { npcId: 'tomas', perceived: false }],
});

// Validation: full coverage passes and is ordered by payload…
assert.deepEqual(
    validatePerception(payload, { results: [{ npcId: 'tomas', perceived: false }, { npcId: 'mira', perceived: true }] }),
    { results: [{ npcId: 'mira', perceived: true }, { npcId: 'tomas', perceived: false }] },
);
// …missing NPC or non-boolean throws (job must fail → backend re-queues).
assert.throws(() => validatePerception(payload, { results: [{ npcId: 'mira', perceived: true }] }));
assert.throws(() => validatePerception(payload, { results: [{ npcId: 'mira', perceived: 'yes' }, { npcId: 'tomas', perceived: false }] }));
assert.throws(() => validatePerception(payload, {}));

console.log('executor perception: OK');
