export type NoticeSummary = {
  id: number;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoticeDetail = NoticeSummary & {
  content: string;
};

export type NoticeInput = {
  title: string;
  content: string;
  isPinned?: boolean;
};