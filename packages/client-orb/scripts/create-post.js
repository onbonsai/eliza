fetch('https://eliza.bonsai.meme/c3bd776c-4465-037f-9c7a-bf94dfba78d9/orb/create-post', {
    method: 'POST'
})
.then(response => response.text())
.then(result => console.log(result))
.catch(error => {
    console.error('Error:', error);
    process.exit(1);
});