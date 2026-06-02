// Multi-point sparkle / starburst — used to mark AI-driven affordances
// (e.g. the AI Copilot launcher). Fixed at 20×20 with a black fill so it
// reads on the white pill backgrounds used by the design system; wrap or
// recolor at the parent level if the design ever needs a variant.
export const AiSparkleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    className="w-[20px] h-[20px] shrink-0"
  >
    <path
      d="M14.9978 1.35833L12.5329 7.50685L18.5708 5.01514L13.4413 9.12473L20 10.0332L13.4732 10.8724L13.4413 11.0022L18.5708 14.9503L12.4664 12.4932L14.9978 18.5753L10.9099 13.4621L9.93491 20L9.0583 13.3987L4.99928 18.5753L7.46709 12.4932L1.299 14.9849L6.55866 10.8753L0 9.96972L6.55866 9.09301L1.36265 4.98342L7.46709 7.50685L5.0311 1.42466L9.0583 6.6013L9.99855 0L10.9417 6.6013L14.9978 1.35833Z"
      fill="#000"
    />
  </svg>
);
