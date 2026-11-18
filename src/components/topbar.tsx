import { Link } from "@tanstack/react-router";
import { CircleHelp, FolderArchive, Gem, LockKeyhole, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type TopbarProps = {
  activePage: "catalog" | "inspect";
  caption: string;
  statusText?: string;
};

export function Topbar({ activePage, caption, statusText }: TopbarProps) {
  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand" aria-label="Studio Vault home">
        <span className="brand-mark">
          <Gem aria-hidden="true" />
        </span>
        <span className="brand-word">
          STUDIO <span>VAULT</span>
        </span>
      </Link>
      <div className="topbar-divider" />
      <div className="topbar-caption">{caption}</div>
      <nav className="topbar-nav" aria-label="Workspace">
        <Button asChild variant={activePage === "catalog" ? "outline" : "ghost"} size="sm">
          <Link to="/" aria-current={activePage === "catalog" ? "page" : undefined}>
            Shopify library
          </Link>
        </Button>
        <Button asChild variant={activePage === "inspect" ? "outline" : "ghost"} size="sm">
          <Link to="/inspect" aria-current={activePage === "inspect" ? "page" : undefined}>
            Image details
          </Link>
        </Button>
      </nav>
      <div className="topbar-right">
        {statusText ? (
          <>
            <span className="connection-dot" aria-hidden="true" />
            <span>{statusText}</span>
          </>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="help-trigger"
              aria-label="About Studio Vault and media availability"
              title="About Studio Vault"
            >
              <CircleHelp className="help-icon" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="help-popover">
            <h3>How Studio Vault works</h3>
            <ul>
              <li>
                <FolderArchive aria-hidden="true" />
                <span>
                  <strong>Structured &amp; clean A–Z exports:</strong> Download original product
                  folders, or enable <strong>Clean A–Z</strong> to scrub EXIF, XMP, IPTC, GPS,
                  signatures, editing history, filenames &amp; store footprints locally in your
                  browser before packing the ZIP.
                </span>
              </li>
              <li>
                <Video aria-hidden="true" />
                <span>
                  <strong>HD videos:</strong> Captures the highest-resolution Shopify-hosted MP4
                  stream when published on the product page.
                </span>
              </li>
              <li>
                <LockKeyhole aria-hidden="true" />
                <span>
                  <strong>Private image auditing:</strong> The Image details workspace processes
                  local files exclusively in your browser — nothing is uploaded.
                </span>
              </li>
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
