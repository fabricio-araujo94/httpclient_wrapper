import { mainApi } from "../api"

export interface User {
    id: number;
    email: string;
    role: string;
}

export class UserService {
    static async getProfile(): Promise<User> {
        return mainApi.get<User>('/users/me');
    }

    static async updateProfile(data: Partial<User>): Promise<User> {
        return mainApi.put<User>('/users/me', data);
    }
}