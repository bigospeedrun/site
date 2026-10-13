// Initials for players without a personal GitHub avatar: organizations, papers and plain names.
// Only the first named author counts, so "A and B (2019), Title" gives the initials of A.
export function initials(name:string):string{
 const lead=name.split(/;|,|\(| and | with | & /)[0].trim();
 const words=lead.split(/\s+/).filter(word=>/^\p{L}/u.test(word));
 if(!words.length)return '?';
 const first=Array.from(words[0])[0];
 if(words.length>1)return (first+Array.from(words.at(-1)!)[0]).toUpperCase();
 // One word: add its next capital letter, so OpenAI gives OA.
 const capital=Array.from(words[0]).slice(1).find(letter=>/\p{Lu}/u.test(letter));
 return (first+(capital??'')).toUpperCase();
}
