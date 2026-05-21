export interface DaemonResponse<T = any> {
    data: T;
    status: number;
}
export declare class DaemonClient {
    private baseUrl;
    constructor(baseUrl?: string);
    fetch<T = any>(path: string, options?: RequestInit): Promise<T>;
    get<T = any>(path: string): Promise<T>;
    post<T = any>(path: string, body?: any): Promise<T>;
    delete<T = any>(path: string): Promise<T>;
    put<T = any>(path: string, body?: any): Promise<T>;
}
export declare const daemon: DaemonClient;
