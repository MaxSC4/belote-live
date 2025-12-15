declare module "animejs" {
    type AnimeTarget = string | Element | Element[] | NodeListOf<Element>;
    type AnimeProperties = Record<string, unknown>;

    interface AnimeParams extends AnimeProperties {
        targets?: AnimeTarget | AnimeTarget[];
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
        timeline(params?: AnimeParams): AnimeInstance;
        remove(targets: AnimeTarget | AnimeTarget[]): void;
        set(targets: AnimeTarget | AnimeTarget[], properties: AnimeProperties): void;
        stagger(value: number | number[], options?: AnimeProperties): (el: Element, index: number, total: number) => number;
        random(min: number, max: number): number;
    }

    const anime: AnimeStatic;
    export default anime;
}
