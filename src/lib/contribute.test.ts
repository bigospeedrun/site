import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contributePrompt} from './contribute.ts';

test('the contribute prompt is the approved text with a full public link', () => {
 assert.equal(contributePrompt, 'Read https://bigospeedrun.com/about#get-started and follow it to contribute to Big O Speedrun.');
 // Agents fetch the link as given: absolute, on our domain, no query parameters.
 const urls = contributePrompt.match(/https:\/\/\S+?(?=[.,)]?(?:\s|$))/g) ?? [];
 assert.deepEqual(urls, ['https://bigospeedrun.com/about#get-started']);
});
