import React, { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { GlassTabBar, GlassTab } from "./ui";
import { HistoryDrawer, useHistoryDrawer } from "./HistoryDrawer";
import { ProjectMetadata } from "@/types";
import { useProjectHistoryStore } from "@/store/projectHistoryStore";

type HeaderProps = {
  selectedTab: number;
  onTabChange: (index: number) => void;
  onNewProject: () => void;
  projectId?: string;
  isNewProject?: boolean;
  projectName?: string;
};

const tabItems = [
  {
    name: "Brief",
    icon: (selected: boolean) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 2H2V14H14V2Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 5H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 8H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 11H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Script",
    icon: (selected: boolean) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5 12H3C2.46957 12 1.96086 11.7893 1.58579 11.4142C1.21071 11.0391 1 10.5304 1 10V3C1 2.46957 1.21071 1.96086 1.58579 1.58579C1.96086 1.21071 2.46957 1 3 1H10C10.5304 1 11.0391 1.21071 11.4142 1.58579C11.7893 1.96086 12 2.46957 12 3V5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 15L8 12H13C13.5304 12 14.0391 11.7893 14.4142 11.4142C14.7893 11.0391 15 10.5304 15 10V7C15 6.46957 14.7893 5.96086 14.4142 5.58579C14.0391 5.21071 13.5304 5 13 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V10C4 10.5304 4.21071 11.0391 4.58579 11.4142C4.96086 11.7893 5.46957 12 6 12V15Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Music",
    icon: (selected: boolean) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M6 13.5V3.5L14 2V12"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 13.5C5.10457 13.5 6 12.6046 6 11.5C6 10.3954 5.10457 9.5 4 9.5C2.89543 9.5 2 10.3954 2 11.5C2 12.6046 2.89543 13.5 4 13.5Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "FX",
    icon: (selected: boolean) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 2V14"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.6667 4V12"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.33333 4V12"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Mix!",
    icon: (selected: boolean) => {
      // For the mixer/done icon, we need to handle both states
      return selected ? (
        // Done icon for selected state
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M13.3333 4L6 11.3333L2.66667 8"
            stroke="#2F7DFA"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Mixer icon for unselected state
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.66667 4.66667L13.3333 4.66667"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 8L12 8"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.66667 11.3333H9.33333"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 4.66667V6.66667"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 8V10"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  {
    name: "Preview",
    icon: (selected: boolean) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 3C4.66667 3 2 8 2 8S4.66667 13 8 13C11.3333 13 14 8 14 8S11.3333 3 8 3Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export function Header({
  selectedTab,
  onTabChange,
  onNewProject,
  projectId,
  isNewProject,
  projectName,
}: HeaderProps) {
  const { isOpen, toggle, close } = useHistoryDrawer();
  const { recentProjects, loadProjects } = useProjectHistoryStore();

  const router = useRouter();

  // Load projects when component mounts to ensure count is available
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleProjectSelect = (project: ProjectMetadata) => {
    console.log(
      "🔄 Header: Navigating to project:",
      project.id,
      project.headline
    );
    router.push(`/project/${project.id}`);
    close();
  };
  return (
    <header className="py-10 bg-black">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex-shrink-0 ">
          <Image
            src="/aca.svg"
            alt="Wise.blue"
            width={114}
            height={31}
            className="h-12 -mb-3 w-auto "
          />
        </div>

        <div className="flex-1 mx-12">
          <div className="flex flex-col justify-center items-center">
            <GlassTabBar className="py-2">
              {tabItems.map((item, index) => (
                <GlassTab
                  key={item.name}
                  isActive={selectedTab === index}
                  onClick={() => onTabChange(index)}
                >
                  {item.icon(selectedTab === index)}
                  <span className="hidden xl:inline">{item.name}</span>
                </GlassTab>
              ))}
            </GlassTabBar>
          </div>
        </div>

        <div className="flex items-center gap-4 relative">
          <button
            onClick={onNewProject}
            className="px-3 py-3 rounded-full flex items-center gap-2 text-gray-300 text-sm border transition-all duration-200 bg-wb-blue/10 backdrop-blur-sm border-wb-blue/20 hover:bg-wb-blue/20 hover:border-wb-blue/30 focus:outline-none focus:ring-1 focus:ring-wb-blue/50 whitespace-nowrap"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="flex-shrink-0"
            >
              <path
                d="M9.5 1H3C2.46957 1 1.96086 1.21071 1.58579 1.58579C1.21071 1.96086 1 2.46957 1 3V13C1 13.5304 1.21071 14.0391 1.58579 14.4142C1.96086 14.7893 2.46957 15 3 15H11C11.5304 15 12.0391 14.7893 12.4142 14.4142C12.7893 14.0391 13 13.5304 13 13V4.5L9.5 1Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 1V4.5H13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="hidden xl:inline text-sm whitespace-nowrap">
              New Ad
            </span>
          </button>

          {/* Active project name - only show when there's a loaded project */}
          {projectName && !isNewProject && (
            <span className="text-white/90 text-sm font-medium truncate max-w-[200px] px-3 py-2">
              {projectName}
            </span>
          )}

          <button
            onClick={toggle}
            className="flex items-center text-white/70 text-sm hover:text-white transition-colors duration-200 group"
          >
            <span>History</span>
            {recentProjects.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-white/20 text-white text-xs rounded-full min-w-[20px] text-center">
                {recentProjects.length}
              </span>
            )}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="ml-1 flex-shrink-0"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <HistoryDrawer
            isOpen={isOpen}
            onClose={close}
            onProjectSelect={handleProjectSelect}
            currentProjectId={projectId}
          />
        </div>
      </div>
    </header>
  );
}
