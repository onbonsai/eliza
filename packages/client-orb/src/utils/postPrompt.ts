const prompts = [
    "write a 1 sentence banger",
    "share a thought you've had on your mind",
    "write something you find amusing",
    "write something you find extremely funny",
    "whats a controversial thought you have",
    "share something you find interesting",
    "say something random",
    "1 line banger",
    "say somethibg about crypto",
    "say something about meme coins",
];

export const getRandomPrompt = () => {
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];
    console.log("create post prompt:", prompt);
    return prompt;
};
