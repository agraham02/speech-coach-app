import { PROMPT_TASKS, prepSentence, taskBrief, taskForCategory, taskLabel, taskOf } from "../promptTask";

describe("prompt tasks", () => {
  it("derives a task from the category, and answers for anything else", () => {
    expect(taskForCategory("Story")).toBe("story");
    expect(taskForCategory("Debate")).toBe("debate");
    expect(taskForCategory("One word")).toBe("word");
    expect(taskForCategory("My own category")).toBe("answer");
  });

  it("lets a prompt name its own task", () => {
    expect(taskOf({ category: "Presentations", task: "closing" })).toBe("closing");
    expect(taskOf({ category: "Explain" })).toBe("explain");
  });

  it("has a brief for every task, and labels only where the category doesn't say it", () => {
    for (const task of PROMPT_TASKS) expect(taskBrief(task).length).toBeGreaterThan(40);
    expect(taskLabel("closing")).toBe("Closing only");
    expect(taskLabel("story")).toBeNull();
  });

  it("tells the reviewer not to penalize a missing introduction on a closing", () => {
    expect(taskBrief("closing")).toMatch(/Do not penalize a missing introduction/);
    expect(taskBrief("opening")).toMatch(/Do not penalize a missing body or conclusion/);
    expect(taskBrief("scenario")).toMatch(/invent/);
  });

  it("describes cold starts, short prep and research differently", () => {
    expect(prepSentence(null)).toMatch(/cold start/);
    expect(prepSentence({ seconds: 30, researched: false })).toMatch(/30 seconds to think/);
    const research = prepSentence({ seconds: 180, researched: true, notesOnScreen: true });
    expect(research).toMatch(/3 minutes to research/);
    expect(research).toMatch(/notes were on screen/);
  });
});
