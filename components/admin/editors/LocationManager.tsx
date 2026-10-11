"use client";
import { Button } from "@/components/admin/button";
import { Input } from "@/components/admin/input";
import { type Catalog } from "@/lib/admin/catalog";
import { MapPin } from "lucide-react";
import { useState } from "react";

export default function LocationManager({
  catalog,
  busy,
  onSave,
}: {
  catalog: Catalog;
  busy: boolean;
  onSave: (catalog: Catalog) => Promise<void>;
}) {
  const [location, setLocation] = useState(
      catalog.location ?? {
        name: "leaf & bowl",
        address: "",
        detailAddress: "",
      },
    ),
    [mapAddress, setMapAddress] = useState(catalog.location?.address ?? ""),
    [error, setError] = useState("");
  const mapUrl =
    "https://maps.google.com/maps?q=" +
    encodeURIComponent(mapAddress) +
    "&output=embed&hl=ko";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIND OUR STORE</div>
          <h1>위치 및 배달 관리</h1>
          <p className="muted">매장 위치를 설정하고 지도에서 확인하세요.</p>
        </div>
      </div>
      <section className="surface">
        <div className="section-heading">
          <h2>매장 위치</h2>
          {catalog.location && <span className="meta">등록된 위치</span>}
        </div>
        <div className="store-location-grid">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const cleaned = {
                name: location.name.trim(),
                address: location.address.trim(),
                detailAddress: location.detailAddress.trim(),
              };
              if (!cleaned.name || !cleaned.address) {
                setError("매장 이름과 주소를 입력해주세요.");
                return;
              }
              try {
                await onSave({ ...catalog, location: cleaned });
                setLocation(cleaned);
                setMapAddress(cleaned.address);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <fieldset disabled={busy}>
              <label className="field">
                매장 이름
                <Input
                  required
                  maxLength={100}
                  value={location.name}
                  onChange={(e) =>
                    setLocation({ ...location, name: e.target.value })
                  }
                  placeholder="예: leaf & bowl 시청점"
                />
              </label>
              <label className="field">
                매장 주소
                <Input
                  required
                  maxLength={300}
                  value={location.address}
                  onChange={(e) =>
                    setLocation({ ...location, address: e.target.value })
                  }
                  placeholder="도로명 주소를 입력해주세요"
                />
              </label>
              <label className="field">
                상세 주소
                <Input
                  maxLength={200}
                  value={location.detailAddress}
                  onChange={(e) =>
                    setLocation({ ...location, detailAddress: e.target.value })
                  }
                  placeholder="예: 1층, 101호"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={!location.address.trim()}
                onClick={() => setMapAddress(location.address.trim())}
              >
                <MapPin size={16} />
                지도에서 확인
              </Button>
              <div className="form-footer">
                <Button type="submit" disabled={busy}>
                  {busy ? "저장 중…" : "매장 위치 저장"}
                </Button>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
          <div className="store-map-preview">
            <div className="eyebrow">GOOGLE MAPS</div>
            {mapAddress ? (
              <>
                <iframe
                  key={mapAddress}
                  title={"Google 지도: " + mapAddress}
                  src={mapUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
                <p className="meta">{mapAddress}</p>
                <a
                  className="store-map-link"
                  href={
                    "https://www.google.com/maps/search/?api=1&query=" +
                    encodeURIComponent(mapAddress)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google 지도에서 크게 보기 ↗
                </a>
              </>
            ) : (
              <div className="store-map-empty">
                <MapPin size={32} />
                <p>
                  매장 주소를 입력하고
                  <br />
                  지도에서 확인을 눌러주세요.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="surface delivery-pending">
        <div className="section-heading">
          <h2>배달 관리</h2>
          <span className="pill">보류</span>
        </div>
        <p className="muted">
          배달 설정은 운영 방식이 정해진 뒤 추가할 예정입니다.
        </p>
      </section>
    </>
  );
}
