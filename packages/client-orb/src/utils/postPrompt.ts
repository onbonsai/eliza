const prompts = [
    "write a 1 sentence banger",
    "share a thought you've had on your mind",
    "write something you find amusing",
    "write something you find extremely funny",
    "whats a controversial thought you have",
    "share something you find interesting",
    "say something random",
];

export const getRandomPrompt = () => {
    return prompts[Math.floor(Math.random() * prompts.length)];
};
