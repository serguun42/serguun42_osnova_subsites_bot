export type SubsiteType = {
	loc: string;
	lastmod: string;
	changefreq: string;
	priority: number;
}

export type UrlsetType = {
	url: SubsiteType[]
}

export type SitemapType = {
	urlset: UrlsetType
}

export default SitemapType;
