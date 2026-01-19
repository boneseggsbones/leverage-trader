// Mock for @auth/express
export const ExpressAuth = (config: any) => {
    return (req: any, res: any, next: any) => next();
};

export const getSession = async (req: any) => {
    return null;
};
