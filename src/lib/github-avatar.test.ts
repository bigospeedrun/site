// Nil, 2026-11-04: "why does the same user sometimes have picture and sometimes not?". An avatar matches only a GitHub
// profile url (https://github.com/<login>, no deeper path), on Big O and Other bounds rows alike; never a name.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {githubProfileLogin, withGithubAvatar, authorFromProfile} from './record-links.ts';

const avatars = {darkhipo: '/avatars/darkhipo-0123456789.png'};
test('only a GitHub profile url gives a login', () => {
  assert.equal(githubProfileLogin('https://github.com/darkhipo'), 'darkhipo');
  assert.equal(githubProfileLogin('https://github.com/DarkHipo/'), 'DarkHipo');
  assert.equal(githubProfileLogin('https://github.com/openai/math'), undefined);
  assert.equal(githubProfileLogin('https://orcid.org/0000-0001'), undefined);
  assert.equal(githubProfileLogin(undefined), undefined);
});
test('a hand-added claim author with a profile url gets the stored avatar and keeps its name', () => {
  assert.deepEqual(withGithubAvatar({name: 'Dmitri I. Arkhipov', url: 'https://github.com/darkhipo'}, avatars),
    {name: 'Dmitri I. Arkhipov', url: 'https://github.com/darkhipo', avatar: '/avatars/darkhipo-0123456789.png'});
  assert.equal(withGithubAvatar({name: 'darkhipo', url: 'https://example.com/darkhipo'}, avatars).avatar, undefined);
  assert.equal(withGithubAvatar({name: 'Someone', url: 'https://github.com/unknown'}, avatars).avatar, undefined);
});
test('a Big O author takes an avatar only from a profile url, not from a repository url under that login', () => {
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/darkhipo'}, {}, avatars).avatar, '/avatars/darkhipo-0123456789.png');
  assert.equal(authorFromProfile({name: 'x', url: 'https://github.com/darkhipo/some-repo'}, {}, avatars).avatar, undefined);
});
test('an author whose link is a repository takes the avatar of its explicit login, and a name alone gives none (site#17)', () => {
  const group = {name: 'Elliot Glazer', url: 'https://github.com/elliotglazer/diophantine-z-q'};
  assert.equal(withGithubAvatar(group, {elliotglazer: '/avatars/e.png'}).avatar, undefined);
  assert.deepEqual(withGithubAvatar({...group, login: 'elliotglazer'}, {elliotglazer: '/avatars/e.png'}),
    {...group, login: 'elliotglazer', avatar: '/avatars/e.png'});
  assert.equal(withGithubAvatar({...group, login: 'nobody'}, {elliotglazer: '/avatars/e.png'}).avatar, undefined);
  // The profile url wins over a login that disagrees with it.
  assert.equal(withGithubAvatar({name: 'x', url: 'https://github.com/darkhipo', login: 'elliotglazer'}, {...avatars, elliotglazer: '/avatars/e.png'}).avatar, '/avatars/darkhipo-0123456789.png');
});
