// Mock for Google provider
const Google = (config: any) => ({
    id: 'google',
    name: 'Google',
    type: 'oauth',
    ...config
});

export default Google;
