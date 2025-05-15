import React from "react";
import Image from "next/image";

type HeaderProps = {
  selectedTab: number;
  onTabChange: (index: number) => void;
  onStartOver: () => void;
};

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

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
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 5H11.5"
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 8H11.5"
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 11H11.5"
          stroke={selected ? "#000000" : "#FFFFFF"}
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
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 15L8 12H13C13.5304 12 14.0391 11.7893 14.4142 11.4142C14.7893 11.0391 15 10.5304 15 10V7C15 6.46957 14.7893 5.96086 14.4142 5.58579C14.0391 5.21071 13.5304 5 13 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V10C4 10.5304 4.21071 11.0391 4.58579 11.4142C4.96086 11.7893 5.46957 12 6 12V15Z"
          stroke={selected ? "#000000" : "#FFFFFF"}
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
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 13.5C5.10457 13.5 6 12.6046 6 11.5C6 10.3954 5.10457 9.5 4 9.5C2.89543 9.5 2 10.3954 2 11.5C2 12.6046 2.89543 13.5 4 13.5Z"
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12Z"
          stroke={selected ? "#000000" : "#FFFFFF"}
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
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.6667 4V12"
          stroke={selected ? "#000000" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.33333 4V12"
          stroke={selected ? "#000000" : "#FFFFFF"}
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
            stroke="#000000"
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
];

export function Header({ selectedTab, onTabChange, onStartOver }: HeaderProps) {
  return (
    <header className="bg-black py-4">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex-shrink-0">
          <Image src="/logo.svg" alt="Wise.blue" width={112} height={35} />
        </div>

        <div className="flex-1 mx-12">
          <div className="flex justify-center items-center">
            {tabItems.map((item, index) => (
              <React.Fragment key={item.name}>
                <button
                  onClick={() => onTabChange(index)}
                  className={classNames(
                    "rounded-full px-5 py-1.5 border outline-none cursor-pointer ",
                    selectedTab === index
                      ? "bg-white text-black border-white"
                      : "text-white border-white hover:bg-gray-500"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.icon(selectedTab === index)}
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                </button>

                {/* Dotted line between tabs, except after the last one */}
                {index < tabItems.length - 1 && (
                  <div className="w-12 h-px border-t border-dashed border-white/30 mx-1"></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="flex items-center text-white text-sm">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-2 h-4 w-auto"
            >
              <path
                d="M10 6V10L12.5 12.5M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            History
          </button>

          <button
            onClick={onStartOver}
            className="border border-red-400/50 hover:bg-red-900 text-red-400 rounded-full px-4 py-1.5 text-sm font-medium flex items-center"
          >
            Start Over
            <svg
              viewBox="-0.5 -0.5 16 16"
              xmlns="http://www.w3.org/2000/svg"
              height="16"
              width="16"
              className="ml-2 h-4 w-auto"
            >
              <path
                d="m11.465 5.75 -2.375 -4.1762500000000005a1.875 1.875 0 0 0 -3.25 0l-0.66125 1.14375"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="M7.46375 12.5625H12.1875a1.875 1.875 0 0 0 1.625 -2.8125l-0.8125 -1.40625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                stroke-linejoin="round"
                stroke-width="1"
              ></path>
              <path
                d="m3.4962500000000003 5.53 -2.375 4.21875a1.875 1.875 0 0 0 1.625 2.8125h1.9075"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke-width="1"
              ></path>
              <path
                d="m9.338750000000001 10.68625 -1.875 1.875 1.875 1.875"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
              <path
                d="m12.151250000000001 3.18625 -0.68625 2.56125 -2.56125 -0.68625"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke-width="1"
              ></path>
              <path
                d="m0.935 6.21625 2.56125 -0.68625 0.68625 2.56125"
                fill="none"
                stroke="#ff6467"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1"
              ></path>
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
