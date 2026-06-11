import { useAd } from "@/hooks/ad";
import { Input } from "@headlessui/react";
import { PencilIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";

type ProjectNameProps = {
  name: string;
  onClick?: () => void;
};

const ProjectName = ({ name, onClick }: ProjectNameProps) => {
  return (
    <span
      className="px-4 py-2 border border-transparent text-center text-nowrap overflow-hidden text-ellipsis"
      onClick={onClick}
    >
      {name}
    </span>
  );
};
type EditableProjectNameProps = {
  id: string;
};

export const EditableProjectName = ({ id }: EditableProjectNameProps) => {
  const { metadata, update, isLoading } = useAd(id);

  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(metadata.name);

  useEffect(() => setNewName(metadata.name), [metadata.name]);

  return (
    <div
      className={twMerge(
        "mb-2 px-6 flex gap-2 justify-center group cursor-pointer items-center align-middle",
        "sm:max-w-[350px] xl:max-w-[600px] overflow-hidden",
      )}
    >
      {isLoading ? (
        <span className="h-[42px]" />
      ) : isEditing ? (
        <Input
          className={twMerge(
            "flex-1 px-4 py-2",
            "rounded-xl border border-white/20 bg-white/10shadow-lg backdrop-blur-md transition focus:border-white/40 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30",
          )}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            setNewName(metadata.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setIsEditing(false);
              setNewName(metadata.name);
            }
            if (e.key === "Enter") {
              setIsEditing(false);

              update({ name: newName });
            }
          }}
          autoFocus
        />
      ) : (
        <>
          <ProjectName
            name={metadata.name}
            onClick={() => setIsEditing(true)}
          />
          <PencilIcon
            width={16}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsEditing(true)}
          />
        </>
      )}
    </div>
  );
};
