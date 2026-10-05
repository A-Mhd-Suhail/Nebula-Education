export type Role = "student" | "teacher" | "hm" | "meo" | "deo" | "admin";
export type Priority = "low" | "medium" | "high" | "critical";

export interface UserProfile {
  uid: string; name: string; email: string; role: Role;
  studentId?: string; teacherId?: string; className?: string; subject?: string;
  airScore: number; behaviorScore?: number; createdAt?: number;
}

export interface ClassSession {
  id: string; teacherUid: string; teacherName: string; subject: string; className: string;
  startedAt: number; active: boolean;
  scheduledStart?: string; scheduledEnd?: string; actualEnd?: number;
}

export interface ContentItem {
  id: string; sessionId: string; type: "note" | "video" | "test"; text: string;
  quiz?: { question: string; options: string[]; correctIndex: number; subject: string };
  createdAt: number;
}

export interface Assignment {
  id: string; title: string; dueDate?: string; subject?: string; className?: string;
  by?: string; teacherUid?: string; maxMarks?: number; createdAt: number;
}

export interface Submission {
  id: string; assignmentId: string; assignmentTitle?: string;
  studentUid: string; studentName: string; text?: string; link?: string;
  marksGiven?: number; marksMax?: number; feedback?: string; markedBy?: string;
  submittedAt: number;
}

export interface MarkEntry {
  id: string; studentUid: string; studentName?: string; exam: string; subject: string;
  score: number; total: number; sessionId?: string; createdAt: number;
}

export interface Doubt {
  id: string; studentUid: string; studentName: string; subject: string; question: string;
  status: "open" | "solved"; answer?: string; answeredBy?: string; answeredAt?: number; createdAt: number;
}

export interface FeedPost {
  id: string; authorUid: string; authorName: string; role: Role;
  content: string; likes: string[]; createdAt: number;
}

export interface Project {
  id: string; studentUid: string; studentName: string; title: string;
  description?: string; link?: string; likedBy: string[]; createdAt: number;
}

export interface Rating {
  id: string; teacherUid: string; teacherName: string; studentUid: string;
  studentName: string; stars: number; comment?: string; createdAt: number;
}

export interface SyllabusTopic {
  id: string; date: string; subject: string; topic: string;
  doneByTeacher: boolean; doneByAI: boolean; createdAt: number;
}

export interface Quiz { id: string; question: string; options: string[]; correctIndex: number; subject: string; }

export interface Attendance {
  id: string; date: string; uid: string; name: string; role: Role;
  status: string; method: string; sessionId?: string; createdAt: number;
}

/* ================= HARDWARE ================= */

export interface QuizQuestion { question: string; options: string[]; correctIndex: number; }

export interface QuizRequest {
  id: string; studentUid: string; studentName: string; topic: string; subject: string;
  questions: QuizQuestion[]; status: "pending" | "sent" | "rejected" | "completed";
  createdBy: string; createdAt: number; approvedAt?: number;
  score?: number; total?: number; completedAt?: number;
}

export interface Incident {
  id: string; type: "fight" | "misbehavior" | "noise" | "teacher_violation";
  room: string; involvedIds: string[]; involvedNames: string[];
  confidence?: number; description: string;
  status: "open" | "reviewed" | "resolved" | "escalated" | "dismissed";
  source: "hardware" | "teacher" | "system" | "hm";
  priority: Priority;
  cameraId?: string; reviewerNote?: string; reviewedBy?: string; reviewedAt?: number;
  reportedBy?: string; createdAt: number; resolvedAt?: number;
}

export interface NoiseEvent { id: string; room: string; level: number; threshold: number; createdAt: number; }

export interface DeviceTag {
  id: string; tagId: string; uid: string; name: string; role: Role; room: string; createdAt: number;
}

export type HardwareType = "pi" | "esp32" | "camera" | "mic" | "buzzer";

export interface HardwareDevice {
  id: string; deviceId: string; type: HardwareType; room: string;
  status: "online" | "offline" | "error" | "maintenance" | "connecting";
  lastSeen: number; fw?: string; cpuTemp?: number; cpuUsage?: number;
  ram?: number; network?: string; cameraRole?: string;
}

export interface BoardImage {
  id: string; room: string; cameraId: string; image: string; capturedAt: number;
}

export interface ClassroomEvent {
  id: string; eventId: string; type: string; room: string;
  timestamp: number; confidence?: number | null; severity: Priority; meta?: string;
}

export interface AppNotification {
  id: string; uid: string; title: string; body: string; type: string; read: boolean; createdAt: number;
}

export interface AuditEntry {
  id: string; actor: string; actorName: string; actorRole: string;
  action: string; detail?: string; createdAt: number;
}

export interface AirScoreWeights { attendance: number; learning: number; quiz: number; assignments: number; participation: number; }

export interface AirHistory {
  id: string; uid: string; total: number; delta: number; reason?: string;
  breakdown?: Record<string, number>; createdAt: number;
}

export interface PresenceLog {
  id: string; uid: string; name: string; date: string;
  leftAt: number; returnedAt?: number; minutesOut?: number; open: boolean;
}

export interface SpeechLog {
  id: string; room: string; text: string; matchedTopic: string;
  status: "on_track" | "off_track"; createdAt: number;
}

export interface AlertEvent {
  id: string; category: string; priority: Priority; message: string; room: string; refId?: string;
  status: "open" | "ack" | "reviewed" | "dismissed" | "escalated";
  notes?: { by: string; text: string; at: number }[];
  createdAt: number;
}

export interface SystemSettings {
  distanceThreshold: number; entryGraceMin: number; exitGraceMin: number;
  noiseWarningDb: number; noiseAlarmDb: number; noiseDurationSec: number;
  schoolStart: string; schoolEnd: string;
  engagementMinutes: number; quizQuestions: number; coverageThreshold: number;
  heartbeatTimeoutSec: number;
  airWeights: AirScoreWeights;
  mqttBroker: string; mqttTopicIn: string; mqttTopicOut: string;
}