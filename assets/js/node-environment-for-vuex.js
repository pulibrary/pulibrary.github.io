// The vuex packaged with lux 5 assumes that it
// is in a node environment, rather than a browser
window.process = {
    env: {
        NODE_ENV: 'production'
    }
};
