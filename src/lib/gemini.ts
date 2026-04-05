import { GoogleGenAI } from "@google/genai";
import projects from "../projects.json";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function matchProjects(studentProfile: { skills: string[], level: string }) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    You are a matching engine for DevMatch. 
    Given a student's profile:
    Skills: ${studentProfile.skills.join(", ")}
    Level: ${studentProfile.level}

    And a list of open-source projects:
    ${JSON.stringify(projects)}

    Suggest the best 3 projects for this student. 
    For each project, provide:
    1. The project ID.
    2. A "matchScore" (percentage as an integer).
    3. A "matchReason" (a short sentence explaining why it's a good match).

    Return the result as a JSON array of objects with keys: id, matchScore, matchReason.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const matches = JSON.parse(response.text || "[]");
    return matches.map((m: any) => {
      const project = projects.find(p => p.id === m.id);
      return project ? { ...project, matchScore: m.matchScore, matchReason: m.matchReason } : null;
    }).filter(Boolean);
  } catch (error) {
    console.error("Gemini matching error:", error);
    return projects.slice(0, 3).map(p => ({ ...p, matchScore: 85, matchReason: "Based on your general interests." })); // Fallback
  }
}

export async function getSkillGapAnalysis(currentSkills: string[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Based on the following skills: ${currentSkills.join(", ")}, 
    and current market trends in Nigeria for software developers in 2026, 
    suggest the "Next Best Skill" to learn.
    Provide:
    1. The skill name.
    2. A brief explanation (1-2 sentences) of why it's trending in Nigeria.
    
    Return as JSON: { "skill": "...", "reason": "..." }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Skill gap analysis error:", error);
    return { skill: "Cloud Computing", reason: "High demand for AWS/Azure skills in the Nigerian fintech space." };
  }
}

export async function getSkillRoadmap(profile: { skills: string[], level: string }) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Generate a custom 4-step learning roadmap for a developer with these skills: ${profile.skills.join(", ")} 
    at academic level: ${profile.level}.
    Each step should have a title and a brief description.
    Return as JSON: { "steps": [{ "title": "...", "description": "..." }, ...] }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "{ \"steps\": [] }");
  } catch (error) {
    console.error("Roadmap error:", error);
    return { steps: [
      { title: "Git Mastery", description: "Learn advanced branching and rebase strategies." },
      { title: "Clean Code", description: "Implement SOLID principles in your projects." },
      { title: "System Design", description: "Understand scalability and load balancing." },
      { title: "Open Source", description: "Contribute to a major project's governance." }
    ]};
  }
}

export async function getPeerMatch(profile: { skills: string[], level: string }) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    Suggest a peer match for a student at level ${profile.level} with skills: ${profile.skills.join(", ")}.
    The peer should have a similar level but a complementary skill (e.g., if student is Web Dev, peer could be Python/Backend).
    Provide:
    1. A fake name for the peer.
    2. Their primary skill.
    3. A short reason why they are a good match for collaboration.
    
    Return as JSON: { "name": "...", "skill": "...", "reason": "..." }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Peer match error:", error);
    return { name: "Chidi O.", skill: "Python Backend", reason: "Complements your frontend skills for full-stack collaboration." };
  }
}

export async function rankSavedProjects(profile: { level: string }, savedProjects: any[]) {
  const model = "gemini-3-flash-preview";
  const prompt = `
    A student at academic level ${profile.level} (Level 1 is beginner, Level 4 is expert) 
    has saved the following projects: ${JSON.stringify(savedProjects)}.
    
    Rank these projects based on the student's level.
    Provide:
    1. A "recommendation" message like "You saved 5 projects. Based on your Level 2 skills, we recommend starting with [Project Name]."
    2. A "rankedIds" array of project IDs in the recommended order of completion.
    
    Return as JSON: { "recommendation": "...", "rankedIds": ["...", "..."] }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Ranking error:", error);
    return { 
      recommendation: `You saved ${savedProjects.length} projects. Based on your ${profile.level} skills, we recommend starting with ${savedProjects[0]?.name || "your first project"}.`, 
      rankedIds: savedProjects.map(p => p.id) 
    };
  }
}
