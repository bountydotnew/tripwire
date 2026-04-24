export interface User {
	username: string;
	name: string;
	avatar: string;
	accountAge: string;
	publicRepos: number;
	followers: number;
	mergedPrs: number;
	readme: boolean;
	tint: string;
}

export interface EventAction {
	label: string;
	kind: "review" | "view" | "close" | "pause";
}

export interface TripwireEvent {
	id: string;
	kind: string;
	severity: "warning" | "error" | "success";
	title: string;
	preview: string;
	users: string[];
	repo: string;
	ref: string;
	contentType: string;
	createdAt: string;
	ruleFired: string | null;
	groupKey: string;
	action: EventAction | null;
}
