// 지식 창고(knowledge_input) 문서의 규칙. upload·precheck·enrich 가 함께 쓴다.
// 바꿀 때는 CLAUDE.md 의 "필수 태그" 표도 같이 고친다.

export const INPUT_COLLECTION = process.env.FIRESTORE_COLLECTION ?? "knowledge_input";
export const OUTPUT_COLLECTION = "knowledge_output";

export const REQUIRED_TAGS = ["category", "format", "target_audience", "knowledge_type", "created_at", "key_message"];

// 자료 종류와 문서 id 앞부분
export const FORMATS = {
  "강의 녹취": "lecture",
  "강의자료": "material",
  "논문·연구": "paper",
  "칼럼·기고": "column",
  "블로그 글": "post",
  "학생 질문": "qna",
};

export const KNOWLEDGE_TYPES = ["개념·이론", "방법·절차", "사례·경험", "연구 결과", "관점·주장"];

// 반응 등급은 선택 항목이다. 기준이 있는 수치(조회수)가 있을 때만 매긴다.
export const GRADES = ["상", "중", "하"];
export function gradeFromViews(views) {
  if (views >= 1000) return "상";
  if (views >= 100) return "중";
  return "하";
}

// 규칙 2: 학생·질문자 신원 정보는 어떤 필드로도 저장하지 않는다
export const PERSON_KEYS = [
  "author", "author_name", "nickname", "username", "user_id", "profile", "profile_url", "avatar", "channel_name",
  "name", "email", "phone", "student", "student_id", "student_name", "student_number", "score", "grade_score",
];

export const isEmpty = (v) => v === null || v === undefined || v === "";
