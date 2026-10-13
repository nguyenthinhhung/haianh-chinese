import { useState } from "react";
import type { OpenLesson } from "./lessonFiles";
import { LessonEditor } from "./LessonEditor";
import { LibraryScreen } from "./LibraryScreen";
import { useServices } from "./services";

export function App() {
  const { persistence } = useServices();
  const [lesson, setLesson] = useState<OpenLesson | null>(null);

  if (!lesson) return <LibraryScreen onOpen={setLesson} />;
  return (
    <LessonEditor
      key={lesson.dir}
      lesson={lesson}
      onClose={() => {
        void persistence.releaseLock(lesson.doc.id);
        setLesson(null);
      }}
    />
  );
}
