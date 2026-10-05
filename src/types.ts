export type Role = "student" | "teacher" | "hm" | "meo" | "deo";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: Role;
  studentId?: string;
  teacherId?: string;
  className?: string;
  subject?: string;
  airScore: number;
  createdAt?: number;
}

export interface ClassSession {
  id: string;
  teacherUid: string;
  teacherName: string;
  subject: string;
  className: string;
  startedAt: number;
  active: boolean;
}

export interface ContentItem {
  id: string;
  sessionId: string;
  type: "note" | "video" | "test";
  text: string;
  quiz?: { question: string; options: string[]; correctIndex: number; subject: string };
  createdAt: number;
}

export interface Assignment {
  id: string;
  title: string;
  dueDate?: string;
  subject?: string;
  className?: string;
  by?: string;
  createdAt: number;
}

export interface MarkEntry {
  id: string;
  studentUid: string;
  studentName?: string;
  exam: string;
  subject: string;
  score: number;
  total: number;
  sessionId?: string;
  createdAt: number;
}

export interface Doubt {
  id: string;
  studentUid: string;
  studentName: string;
  subject: string;
  question: string;
  status: "open" | "solved";
  answer?: string;
  answeredBy?: string;
  answeredAt?: number;
  createdAt: number;
}

export interface FeedPost {
  id: string;
  authorUid: string;
  authorName: string;
  role: Role;
  content: string;
  likes: string[];
  createdAt: number;
}

export interface Project {
  id: string;
  studentUid: string;
  studentName: string;
  title: string;
  description?: string;
  link?: string;
  likedBy: string[];
  createdAt: number;
}

export interface Rating {
  id: string;
  teacherUid: string;
  teacherName: string;
  studentUid: string;
  studentName: string;
  stars: number;
  comment?: string;
  createdAt: number;
}

export interface SyllabusTopic {
  id: string;
  date: string; // yyyy-mm-dd
  subject: string;
  topic: string;
  doneByTeacher: boolean;
  doneByAI: boolean;
  createdAt: number;
}

export interface Quiz {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  subject: string;
}

export interface Attendance {
  id: string;
  date: string;
  uid: string;
  name: string;
  role: Role;
  status: string;
  method: string;
  sessionId?: string;
  createdAt: number;
}
