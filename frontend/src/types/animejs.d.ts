declare module "animejs" {
    interface AnimeParams {
        targets?: any;
        [key: string]: any;
    }

    interface AnimeInstance {
        play(): void;
        pause(): void;
        restart(): void;
        reverse(): void;
        seek(time: number): void;
        finished: Promise<void>;
    }

    interface AnimeStatic {
        (params: AnimeParams): AnimeInstance;
        timeline(params?: AnimeParams): any;
        remove(targets: any): void;
        set(targets: any, properties: any): void;
        stagger(value: number | number[], options?: any): any;
        random(min: number, max: number): number;
    }

    const anime: AnimeStatic;
    export default anime;
    }
