const Telegraf = require("telegraf"),
	  NodeFetch = require("node-fetch").default,
	  fs = require("fs"),
	  util = require("util"),
	  fsStat = util.promisify(fs.stat),
	  fsWriteFile = util.promisify(fs.writeFile),
	  fsReadFile = util.promisify(fs.readFile),
	  xmlParser = require("fast-xml-parser");


/**
 * @param  {Error[] | String[]} args
 * @returns {void}
 */
const LogMessageOrError = (...args) => {
	const containsAnyError = (args.findIndex((message) => message instanceof Error) > -1),
		  out = (containsAnyError ? console.error : console.log);

	out(new Date());
	args.forEach((message) => out(message));
	out("~~~~~~~~~~~\n\n");
};

const TGE = iStr => {
	if (!iStr) return "";

	if (typeof iStr === "string")
		return iStr
			.replace(/\&/g, "&amp;")
			.replace(/\</g, "&lt;")
			.replace(/\>/g, "&gt;");
	else
		return TGE(iStr.toString());
};


const {
	SITES,
	TELEGRAM
} = require("./serguun42_osnova_subsites_bot.config.json");


const telegraf = new Telegraf.Telegraf(TELEGRAM.TOKEN);
const telegram = telegraf.telegram;


/**
 * @param {string} siteShortName
 * @param {import("./sitemap-type").SubsiteType[]} allFreshSubsites
 * @returns {Promise<import("./sitemap-type").SubsiteType[]>}
 */
const CompareOldToNew = (siteShortName, allFreshSubsites) => {
	const siteFile = `./previous-data/${siteShortName}.json`;
	
	return new Promise((comparingResolve) => {
		fsStat(siteFile)
		.then(() => fsReadFile(siteFile))
		.then((siteFile) => {
			try {
				const parsedJSON = JSON.parse(siteFile.toString());
				return Promise.resolve(parsedJSON);
			} catch (e) {
				return Promise.reject(e);
			}
		})
		.then(/** @param {import("./sitemap-type").SubsiteType[]} allPreviousSubsites */ (allPreviousSubsites) => {
			const previousFlattened = allPreviousSubsites.map(({ loc }) => loc),
				  excludedSubsites = allFreshSubsites.filter(({ loc }) => !previousFlattened.includes(loc));

			return fsWriteFile(siteFile, JSON.stringify(allFreshSubsites, false, "\t"))
			.then(() => comparingResolve(excludedSubsites))
			.catch(LogMessageOrError);
		})
		.catch(() => {
			return fsWriteFile(siteFile, JSON.stringify(allFreshSubsites, false, "\t"))
			.then(() => comparingResolve(allFreshSubsites))
			.catch(LogMessageOrError);
		});
	});
}


let sitesCounter = 0;

/** @type {string[]} */
const sitesTexts = [];
/**
 * @param {string} iText
 * @returns {void}
 */
const AddSiteToQueue = iText => {
	if (iText) sitesTexts.push(iText);
	if (++sitesCounter !== SITES.length) return;

	if (!sitesTexts.length) return LogMessageOrError("No new subsites");

	const joinedTextForMessage = sitesTexts.join("\n\n");
	if (!joinedTextForMessage.length) return LogMessageOrError("No new subsites");


	telegram.sendMessage(TELEGRAM.CHANNEL, `Новые подсайты:\n\n${joinedTextForMessage}\n\n#new_subsites`, {
		disable_web_page_preview: true,
		parse_mode: "HTML"
	})
	.then(() => LogMessageOrError("Send to Telegram new subsites"))
	.catch(LogMessageOrError);
}


SITES.forEach((site) => {
	NodeFetch(site.sitemap_link)
	.then((res) => res.text())
	.then((xml) => {
		try {
			const parsedJSON = xmlParser.parse(xml);
			return Promise.resolve(parsedJSON);
		} catch (e) {
			return Promise.reject(e);
		}
	})
	.then(/** @param {import("./sitemap-type").SitemapType} map */ (map) => {
		if (!map.urlset) return Promise.reject(new Error("No <map.urlset>"));
		if (!map.urlset.url?.length) return Promise.reject(new Error("No subsites in <map.urlset.url>"));

		CompareOldToNew(site.shortname, map.urlset.url)
		.then((newSubsites) => {
			if (!newSubsites) return AddSiteToQueue(null);
			if (!newSubsites.length) return AddSiteToQueue(null);

			const textFromSite = `<b>${site.name}</b>\n\n${newSubsites.map((subsite) => `<a href="${TGE(subsite.loc)}">${TGE(subsite.loc)}</a>`).join("\n")}`;
			AddSiteToQueue(textFromSite);
		});
	})
	.catch((e) => LogMessageOrError(`Error while fetching for ${site.name}`, e));
});
